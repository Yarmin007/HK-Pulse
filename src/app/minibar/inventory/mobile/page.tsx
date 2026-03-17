"use client";
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Lock, Plus, Minus, Save, CheckCircle2, 
  Loader2, ChevronLeft, Wine, Trash2, AlertTriangle, 
  Clock, ListChecks, RefreshCw, Edit3, AlertCircle, CheckCircle, PackageSearch, Calculator, MapPin, Info, Search, X, Wind, User, Sparkles, BedDouble, ChevronDown
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';

const getLocalToday = () => {
    const tz = typeof window !== 'undefined' ? localStorage.getItem('hk_pulse_timezone') || 'Indian/Maldives' : 'Indian/Maldives';
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
};

const getLocalMonth = () => {
    return getLocalToday().substring(0, 7);
};

type Host = { id: string; full_name: string; host_id: string; };
type MasterItem = { article_number: string; article_name: string; generic_name?: string; category: string; image_url?: string; inventory_type?: string; is_minibar_item: boolean; villa_location?: string; };

type UniversalTask = {
    schedule_id: string;
    inventory_type: string;
    villa_number: string;
    status: string;
};

// --- TYPES FOR CLEANING ALLOCATION ---
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

export default function MyTasksResponsive() {
  const [isMounted, setIsMounted] = useState(false);
  const [step, setStep] = useState<2 | 3>(2);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [currentHost, setCurrentHost] = useState<Host | null>(null);
  const [dailyTask, setDailyTask] = useState<{shift_type?: string, shift_note?: string} | null>(null);

  // --- CLEANING ALLOCATION STATE ---
  const [myCleaningVillas, setMyCleaningVillas] = useState<number[]>([]);
  const [guestData, setGuestData] = useState<GuestRecord[]>([]);
  const [acData, setAcData] = useState<ACRecord[]>([]);

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

  const loadInitialData = useCallback(async (hostId: string, isManualRefresh: boolean, silent = false) => {
      if (!silent) setIsLoading(true);
      const todayStr = getLocalToday();
      const currentMonth = getLocalMonth();

      // 1. Fetch Shift Info
      const { data: att } = await supabase.from('hsk_attendance').select('shift_type, shift_note').eq('host_id', hostId).eq('date', todayStr).maybeSingle();
      if (att) setDailyTask(att);

      // 2. Fetch DAILY CLEANING ALLOCATION
      const { data: allocData } = await supabase
          .from('hsk_allocations')
          .select('task_details')
          .eq('report_date', todayStr)
          .eq('host_id', hostId)
          .single();

      if (allocData && allocData.task_details) {
          const assignedCleanVillas = parseVillas(allocData.task_details, []).map(Number).filter(n => !isNaN(n));
          setMyCleaningVillas(assignedCleanVillas);
      } else {
          setMyCleaningVillas([]);
      }

      // 3. Fetch Guest List for Daily Cleaning
      const { data: gData } = await supabase
          .from('hsk_daily_summary')
          .select('villa_number, status, arrival_time, departure_time, guest_name')
          .eq('report_date', todayStr);
      if (gData) setGuestData(gData);

      // 4. Fetch AC Tracker Status for Daily Cleaning
      const { data: aData } = await supabase
          .from('hsk_ac_tracker')
          .select('villa_number, status')
          .eq('report_date', todayStr);
      if (aData) setAcData(aData);

      // 5. Fetch UNIVERSAL Inventory Assignments 
      const { data: activeSchedules } = await supabase.from('hsk_inventory_schedules')
          .select('id, inventory_type')
          .eq('status', 'Active');
      
      const taskMap: Record<string, UniversalTask[]> = {};

      if (activeSchedules && activeSchedules.length > 0) {
          const scheduleIds = activeSchedules.map(s => s.id);
          const { data: assignments } = await supabase.from('hsk_inventory_assignments')
              .select('*')
              .in('schedule_id', scheduleIds)
              .eq('host_id', hostId);

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
          const { data: mbAllocations } = await supabase.from('hsk_minibar_allocations').select('villas').eq('date', allocDate).eq('host_id', hostId).maybeSingle();
          
          if (mbAllocations && mbAllocations.villas) {
              const mbVillas = parseVillas(mbAllocations.villas, dvList);
              
              const [y, m] = mbPeriod.split('-').map(Number);
              const startOfMonthUTC = new Date(y, m - 1, 1).toISOString();
              const startOfNextMonthUTC = new Date(y, m, 1).toISOString();
              const { data: mbSubmissions } = await supabase.from('hsk_villa_minibar_inventory').select('villa_number').gte('logged_at', startOfMonthUTC).lt('logged_at', startOfNextMonthUTC).eq('host_id', hostId);
              
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
      const [expiryTargetRes, expiryAllocRes, expiryRemRes] = await Promise.all([
          supabase.from('hsk_expiry_targets').select('*').eq('month_period', currentMonth),
          supabase.from('hsk_expiry_allocations').select('villas').eq('month_period', currentMonth).eq('host_id', hostId).maybeSingle(),
          supabase.from('hsk_expiry_removals').select('*').eq('month_period', currentMonth).eq('host_id', hostId)
      ]);

      if (expiryTargetRes.data) setExpiryTargets(expiryTargetRes.data);
      
      if (expiryAllocRes.data && expiryAllocRes.data.villas) {
          const parsedExpiryVillas = parseVillas(expiryAllocRes.data.villas, dvList);
          setExpiryAssignedVillas(parsedExpiryVillas);
      } else {
          setExpiryAssignedVillas([]);
      }

      if (expiryRemRes.data) {
          const villaMap: Record<string, any> = {};
          expiryRemRes.data.forEach((r: any) => { villaMap[r.villa_number] = r; });
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
    const syncTimezone = async () => {
        const { data } = await supabase.from('hsk_constants').select('label').eq('type', 'system_timezone').maybeSingle();
        if (data && data.label) localStorage.setItem('hk_pulse_timezone', data.label);
    };
    syncTimezone();

    const sessionData = localStorage.getItem('hk_pulse_session');
    if (sessionData) {
        const parsed = JSON.parse(sessionData);
        const hostIdToUse = parsed.id || parsed.host_id; 
        setCurrentHost({ id: parsed.id, full_name: parsed.full_name, host_id: hostIdToUse });
        loadInitialData(hostIdToUse, false);
    } else {
        window.location.href = '/';
    }

    setIsMounted(true);
    fetchCatalog();
  }, [loadInitialData, fetchCatalog]);

  // --- AC STATUS UPDATE HANDLER ---
  const handleAcStatusChange = async (villaNumber: number, newStatus: string) => {
      const todayStr = getLocalToday();
      
      // Update local state instantly for UI
      setAcData(prev => {
          const filtered = prev.filter(a => parseInt(a.villa_number) !== villaNumber);
          return [...filtered, { villa_number: String(villaNumber), status: newStatus }];
      });

      const { error } = await supabase
          .from('hsk_ac_tracker')
          .upsert({
              report_date: todayStr,
              villa_number: String(villaNumber),
              status: newStatus,
              host_id: currentHost?.host_id,
              host_name: currentHost?.full_name,
              updated_at: new Date().toISOString()
          }, { onConflict: 'report_date,villa_number' });

      if (error) {
          toast.error(`Error: ${error.message}`);
          loadInitialData(currentHost!.host_id, false, true); 
      } else {
          toast.success(`V${villaNumber} AC turned ${newStatus}`);
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
        const mbPeriod = getLocalMonth();
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
          isOpen: true, title: `Submit Location ${selectedVilla}?`, message: "Are you sure you want to save this inventory record?", confirmText: "Submit Record", isDestructive: false,
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
          month_period: getLocalMonth(),
          villa_number: selectedVilla,
          host_id: currentHost?.host_id,
          host_name: currentHost?.full_name,
          removal_data: statusOverride === 'All OK' ? [] : removalData,
          status: statusOverride,
          logged_at: new Date().toISOString()
      };

      const { data: existing } = await supabase.from('hsk_expiry_removals')
          .select('id').match({ villa_number: selectedVilla, month_period: getLocalMonth() }).maybeSingle();

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
          .match({ villa_number: selectedVilla, month_period: getLocalMonth() });

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
  const getVillaCardData = (vNum: number) => {
      const match = guestData.find(r => parseInt(r.villa_number) === vNum);
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

      const acMatch = acData.find(a => parseInt(a.villa_number) === vNum);
      const acStatus = acMatch ? acMatch.status.toUpperCase() : 'ON'; // Assumed ON if unlogged

      return { status: shortStatus, headerColor, timeStr, guestName, acStatus };
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

  return (
    <div className="min-h-screen bg-[#FDFBFD] p-4 md:p-8 font-sans text-slate-800 pb-24">
      
      <div className="max-w-5xl mx-auto w-full flex flex-col animate-in fade-in">
        
        {/* --- DASHBOARD VIEW --- */}
        {step === 2 && currentHost && (
            <>
                <div className="flex items-center justify-between mb-8 bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
                   <div className="flex items-center gap-5">
                       <div className="w-16 h-16 rounded-2xl bg-[#6D2158] text-white flex items-center justify-center text-2xl font-black shadow-lg shrink-0">
                          {currentHost.full_name.charAt(0)}
                       </div>
                       <div>
                         <h1 className="text-2xl md:text-3xl font-black tracking-tight text-[#6D2158]">My Tasks</h1>
                         <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">
                            {format(parseISO(getLocalToday()), 'EEEE, d MMMM yyyy')}
                         </p>
                       </div>
                   </div>
                   <button onClick={() => loadInitialData(currentHost.host_id, true)} className="p-3 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-full transition-colors active:scale-95" title="Refresh Tasks">
                       <RefreshCw size={20} className={isLoading ? 'animate-spin text-[#6D2158]' : ''}/>
                   </button>
                </div>

                {isLoading ? (
                    <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#6D2158]" size={32}/></div>
                ) : (
                    <div className="space-y-6">
                        
                        {/* --- DAILY CLEANING ALLOCATION BLOCK --- */}
                        {myCleaningVillas.length > 0 && (
                            <div className="bg-white p-6 md:p-8 rounded-[2.5rem] shadow-sm border border-slate-100 animate-in slide-in-from-bottom-4">
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <h3 className="text-xl font-bold text-slate-800 mb-1 flex items-center gap-2">
                                            <BedDouble size={20} className="text-[#6D2158]" /> My Cleaning Allocation
                                        </h3>
                                        <p className="text-xs text-slate-400 font-medium">Your assigned villas for today.</p>
                                    </div>
                                    <span className="bg-[#6D2158]/10 text-[#6D2158] px-3 py-1 rounded-lg text-xs font-black">
                                        {myCleaningVillas.length} Villas
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                                    {myCleaningVillas.map(v => {
                                        const data = getVillaCardData(v);
                                        return (
                                            <div key={v} className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden flex flex-col transition-transform hover:scale-[1.02] active:scale-95">
                                                
                                                <div className={`p-2.5 flex justify-between items-center ${data.headerColor}`}>
                                                    <span className="text-lg font-black tracking-tighter leading-none">V{v}</span>
                                                    <span className="text-[9px] font-black uppercase tracking-widest bg-white/20 px-1.5 py-0.5 rounded shadow-sm">
                                                        {data.status}
                                                    </span>
                                                </div>

                                                <div className="p-2.5 flex flex-col gap-1.5 flex-1">
                                                    {(data.timeStr || data.guestName) && (
                                                        <div className="flex flex-col gap-1 mb-1">
                                                            {data.timeStr && (
                                                                <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-600 bg-white p-1.5 rounded border border-slate-100">
                                                                    <Clock size={10} className="text-slate-400"/>
                                                                    <span className="truncate">{data.timeStr}</span>
                                                                </div>
                                                            )}
                                                            {data.guestName && (
                                                                <div className="flex items-center gap-1.5 text-[9px] font-bold text-[#6D2158] bg-[#6D2158]/5 p-1.5 rounded border border-[#6D2158]/10">
                                                                    <User size={10} className="opacity-70"/>
                                                                    <span className="truncate">{data.guestName}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {!data.timeStr && !data.guestName && (
                                                        <div className="flex-1"></div>
                                                    )}

                                                    <button 
                                                        onClick={() => handleAcStatusChange(v, data.acStatus === 'ON' ? 'OFF' : 'ON')}
                                                        className={`mt-auto w-full py-2.5 rounded-lg flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-wider transition-all border shadow-sm ${
                                                            data.acStatus === 'ON' 
                                                                ? 'bg-rose-50 border-rose-200 text-rose-700' 
                                                                : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                                        }`}
                                                    >
                                                        <Wind size={14} className={`shrink-0 ${data.acStatus === 'ON' ? 'animate-pulse' : ''}`}/>
                                                        {data.acStatus === 'ON' ? 'AC IS ON' : 'AC TURNED OFF'}
                                                    </button>

                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {/* --- EXPIRY & REFILL AUDIT CARD --- */}
                        {expiryAssignedVillas.length > 0 && (
                            <div className="bg-rose-50 p-6 md:p-8 rounded-[2.5rem] shadow-sm border border-rose-100 animate-in slide-in-from-bottom-3">
                                <div className="mb-6 flex justify-between items-center">
                                    <div>
                                        <h3 className="text-xl font-bold text-rose-800 mb-1 flex items-center gap-2"><AlertTriangle size={20}/> Expiry & Refills</h3>
                                        <p className="text-xs text-rose-600/70 font-medium">Check these villas for targeted missing or expiring items.</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 md:gap-4">
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
                                                className={`aspect-square rounded-3xl flex flex-col items-center justify-center relative shadow-sm border-2 transition-transform active:scale-95 ${
                                                    isDone ? 'bg-emerald-50 border-emerald-500 text-emerald-700 hover:bg-emerald-100' : 
                                                    isSent ? 'bg-indigo-100 border-indigo-400 text-indigo-700 animate-pulse' : 
                                                    isNeedsRefill ? 'bg-amber-100 border-amber-400 text-amber-700 animate-pulse' : 
                                                    'bg-white border-rose-200 text-rose-700 hover:border-rose-400 hover:shadow-md'
                                                }`}
                                            >
                                                {isDone && <CheckCircle2 size={16} className="absolute top-3 right-3 text-emerald-500"/>}
                                                <span className={`font-black ${villa.includes('-') ? 'text-2xl md:text-3xl' : 'text-3xl md:text-4xl'}`}>{villa}</span>
                                                <span className="text-[10px] md:text-xs font-bold uppercase mt-1 opacity-60">
                                                    {isDone ? 'Done' : isSent ? 'Sent' : isNeedsRefill ? 'Refill' : 'Pending'}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* --- DYNAMIC UNIVERSAL INVENTORY CARDS --- */}
                        {Object.entries(universalTasks).map(([taskType, assignments]) => (
                            <div key={taskType} className="bg-white p-6 md:p-8 rounded-[2.5rem] shadow-sm border border-slate-100 animate-in slide-in-from-bottom-4">
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <h3 className="text-xl font-bold text-slate-800 mb-1 flex items-center gap-2">
                                            <PackageSearch size={20} className="text-[#6D2158]"/> {taskType} Count
                                        </h3>
                                        <p className="text-xs text-slate-400 font-medium">Tap a location to begin auditing. You can tap 'Done' locations to re-edit.</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 md:gap-4">
                                    {assignments.map(task => {
                                        const isDone = task.status === 'Submitted';
                                        return (
                                            <button 
                                                key={task.villa_number}
                                                onClick={() => startAudit(task.villa_number, taskType, task.schedule_id)}
                                                className={`aspect-square rounded-3xl flex flex-col items-center justify-center relative shadow-sm border-2 transition-transform active:scale-95 ${isDone ? 'bg-emerald-50 border-emerald-400 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-500' : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-[#6D2158] hover:shadow-md'}`}
                                            >
                                                {isDone && <CheckCircle2 size={16} className="absolute top-3 right-3 text-emerald-500"/>}
                                                <span className={`font-black ${task.villa_number.includes('-') ? 'text-xl md:text-2xl' : 'text-2xl md:text-3xl'} ${!/^\d+$/.test(task.villa_number) && !task.villa_number.includes('-') ? 'text-lg' : ''}`}>{task.villa_number}</span>
                                                <span className="text-[9px] md:text-[10px] font-bold uppercase mt-1 opacity-60">{isDone ? 'Done' : 'Pending'}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}

                        {/* EMPTY STATE IF LITERALLY NO TASKS OF ANY KIND */}
                        {myCleaningVillas.length === 0 && Object.keys(universalTasks).length === 0 && expiryAssignedVillas.length === 0 && (
                            <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm">
                                <CheckCircle size={48} className="mx-auto text-emerald-300 mb-4"/>
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
                <div className={`${isExpiryMode ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-white border-slate-100'} p-6 rounded-[2.5rem] shadow-sm border mb-6 flex items-center justify-between gap-4`}>
                    <div className="flex items-center gap-4">
                        <button onClick={() => { setStep(2); setIsExpiryMode(false); }} className={`p-3 rounded-full transition-colors ${isExpiryMode ? 'bg-white hover:bg-rose-100 text-rose-600' : 'bg-slate-50 hover:bg-slate-100 text-slate-500'}`}><ChevronLeft size={20}/></button>
                        <div>
                            <h2 className={`text-2xl font-black ${isExpiryMode ? 'text-rose-700' : 'text-[#6D2158]'}`}>{selectedVilla}</h2>
                            <p className={`text-xs font-bold uppercase tracking-widest mt-1 ${isExpiryMode ? 'text-rose-500' : 'text-slate-400'}`}>{isExpiryMode ? 'Targeted Tasks' : `${activeTaskType} Audit`}</p>
                        </div>
                    </div>
                    
                    {!isExpiryMode && (
                        <button onClick={() => setShowGuideModal(true)} className="p-3 text-slate-400 hover:text-[#6D2158] hover:bg-purple-50 rounded-xl transition-colors active:scale-95" title="How to Count">
                            <Info size={24}/>
                        </button>
                    )}
                </div>

                {/* UI Content based on Mode */}
                {isExpiryMode ? (
                    ['Removed', 'Sent', 'Refilled'].includes(expiryVillaData[selectedVilla]?.status) ? (
                        
                        // --- AWAITING REFILL / REFILLED SCREEN ---
                        <div className="space-y-4 pb-48 animate-in fade-in">
                            <div className={`${expiryVillaData[selectedVilla]?.status === 'Sent' ? 'bg-indigo-50 border-indigo-200' : expiryVillaData[selectedVilla]?.status === 'Refilled' ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'} border p-6 md:p-8 rounded-[2rem] text-center shadow-sm mb-6 relative`}>
                                <button onClick={handleEditRemovals} className={`absolute top-6 right-6 p-2 bg-white rounded-full shadow-sm transition-colors ${expiryVillaData[selectedVilla]?.status === 'Sent' ? 'text-indigo-600 hover:bg-indigo-100' : expiryVillaData[selectedVilla]?.status === 'Refilled' ? 'text-blue-600 hover:bg-blue-100' : 'text-amber-600 hover:bg-amber-100'}`} title="Edit Removals">
                                    <Edit3 size={16} />
                                </button>
                                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${expiryVillaData[selectedVilla]?.status === 'Sent' ? 'bg-indigo-100 text-indigo-600' : expiryVillaData[selectedVilla]?.status === 'Refilled' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}>
                                    {expiryVillaData[selectedVilla]?.status === 'Sent' ? <CheckCircle size={32}/> : expiryVillaData[selectedVilla]?.status === 'Refilled' ? <CheckCircle2 size={32}/> : <AlertTriangle size={32}/>}
                                </div>
                                <h3 className={`text-2xl font-black tracking-tight ${expiryVillaData[selectedVilla]?.status === 'Sent' ? 'text-indigo-700' : expiryVillaData[selectedVilla]?.status === 'Refilled' ? 'text-blue-700' : 'text-amber-700'}`}>
                                    {expiryVillaData[selectedVilla]?.status === 'Sent' ? 'Items Dispatched!' : expiryVillaData[selectedVilla]?.status === 'Refilled' ? 'Refill Confirmed' : 'Awaiting Refill'}
                                </h3>
                                <p className={`text-sm font-medium mt-2 leading-relaxed ${expiryVillaData[selectedVilla]?.status === 'Sent' ? 'text-indigo-600' : expiryVillaData[selectedVilla]?.status === 'Refilled' ? 'text-blue-600' : 'text-amber-600'}`}>
                                    {expiryVillaData[selectedVilla]?.status === 'Sent' ? 'The items have been sent to you. Please confirm when placed.' : 'Please adjust the counters below if you could not replace all items.'}
                                </p>
                            </div>
                                
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {(expiryVillaData[selectedVilla]?.removal_data || []).map((item: any) => {
                                    const masterItem = masterCatalog.find(c => c.article_number === item.article_number);
                                    const currentRefill = refillCounts[item.article_number] !== undefined ? refillCounts[item.article_number] : item.qty;
                                    const isNotRefilled = currentRefill === 0;
                                    const isPartial = currentRefill > 0 && currentRefill < item.qty;

                                    return (
                                        <div key={item.article_number} className={`bg-white rounded-3xl p-3 shadow-sm border flex flex-col gap-3 relative transition-all ${isNotRefilled ? 'border-rose-300 bg-rose-50/30' : isPartial ? 'border-amber-300' : 'border-slate-200'}`}>
                                            
                                            <div className="w-full aspect-square bg-slate-50 rounded-2xl overflow-hidden flex items-center justify-center p-4">
                                                {masterItem?.image_url ? <img src={masterItem.image_url} className={`w-full h-full object-contain drop-shadow-sm transition-all ${isNotRefilled ? 'grayscale opacity-50' : ''}`} /> : <Wine size={32} className="text-slate-300"/>}
                                            </div>
                                            
                                            <div className="flex flex-col flex-1 px-1 text-center">
                                                <h4 className="text-sm font-black text-slate-800 leading-tight line-clamp-2">{item.name}</h4>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Requested: {item.qty}</p>
                                                
                                                {isNotRefilled && <span className="text-[10px] font-black text-rose-500 uppercase mt-2">Not Refilled</span>}
                                                {isPartial && <span className="text-[10px] font-black text-amber-500 uppercase mt-2">Partial Refill</span>}
                                            </div>

                                            <div className="flex items-center justify-between bg-slate-50 rounded-xl p-1 border border-slate-200 mt-auto">
                                                <button onClick={() => updateRefillCount(item.article_number, -1)} className="w-10 h-10 flex items-center justify-center bg-white rounded-lg shadow-sm text-slate-500 hover:text-rose-500 active:scale-95 transition-all"><Minus size={18}/></button>
                                                <span className={`font-black text-lg ${isNotRefilled ? 'text-rose-600' : 'text-emerald-600'}`}>{currentRefill}</span>
                                                <button onClick={() => updateRefillCount(item.article_number, 1)} className="w-10 h-10 flex items-center justify-center bg-white rounded-lg shadow-sm text-slate-600 hover:text-emerald-600 active:scale-95 transition-all"><Plus size={18}/></button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            
                            <div className="fixed bottom-24 md:bottom-0 left-0 right-0 md:left-64 p-4 md:p-6 bg-white/90 backdrop-blur-xl border-t border-slate-200 z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] pb-safe">
                                <div className="max-w-5xl mx-auto">
                                    <button 
                                        onClick={confirmExpiryRefill} 
                                        disabled={isSaving || expiryVillaData[selectedVilla]?.status === 'Removed'} 
                                        className={`w-full py-5 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 ${
                                            expiryVillaData[selectedVilla]?.status === 'Removed' ? 'bg-slate-400 shadow-none cursor-not-allowed' :
                                            expiryVillaData[selectedVilla]?.status === 'Refilled' ? 'bg-blue-600 shadow-blue-600/20' : 
                                            'bg-emerald-500 shadow-emerald-500/20'}`}
                                    >
                                        {isSaving ? <Loader2 className="animate-spin" size={24}/> : 
                                         expiryVillaData[selectedVilla]?.status === 'Removed' ? <><Clock size={20}/> Waiting for Dispatch</> :
                                        <><CheckCircle2 size={20}/> {expiryVillaData[selectedVilla]?.status === 'Refilled' ? 'Update Confirmation' : 'Confirm Replacements'}</>}
                                    </button>
                                </div>
                            </div>
                        </div>

                    ) : (

                        // --- RECORD REMOVAL SCREEN (Split Sections) ---
                        <div className="space-y-8 pb-48 animate-in fade-in">
                            {groupedTargets.expiry.length === 0 && groupedTargets.refill.length === 0 ? (
                                <p className="text-center font-bold text-slate-400 italic mt-10">No targets set by admin.</p>
                            ) : (
                                <>
                                    {/* EXPIRY & MISSING CHECKS */}
                                    {groupedTargets.expiry.length > 0 && (
                                        <div>
                                            <h3 className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                <AlertTriangle size={14}/> Expiry & Missing Checks
                                            </h3>
                                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                                {groupedTargets.expiry.map((t: any) => {
                                                    const key = t.article_number;
                                                    const masterItem = masterCatalog.find(c => c.article_number === t.article_number);
                                                    const qty = expiryCounts[key] || 0;

                                                    return (
                                                        <div key={key} className={`bg-white rounded-3xl p-3 shadow-sm border flex flex-col gap-3 relative transition-all ${qty > 0 ? 'border-rose-400 ring-4 ring-rose-50' : 'border-slate-200'}`}>
                                                            
                                                            <div className="w-full aspect-square bg-slate-50 rounded-2xl overflow-hidden flex items-center justify-center p-4">
                                                                {masterItem?.image_url ? <img src={masterItem.image_url} className="w-full h-full object-contain drop-shadow-sm" /> : <Wine size={32} className="text-slate-300"/>}
                                                            </div>
                                                            
                                                            <div className="flex flex-col flex-1 px-1 text-center">
                                                                <h4 className="text-sm font-black text-slate-800 leading-tight line-clamp-2">{t.article_name}</h4>
                                                                
                                                                {t.dates && t.dates.length > 0 ? (
                                                                    <div className="flex flex-wrap justify-center gap-1 mt-1.5">
                                                                        {t.dates.map((d: string) => (
                                                                            <span key={d} className="text-[8px] font-black text-rose-500 uppercase tracking-widest bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">
                                                                                {format(parseISO(d), 'dd MMM yyyy')}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <div className="mt-1.5">
                                                                        <span className="text-[8px] font-black text-blue-500 uppercase tracking-widest bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                                                                            Missing Check
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <div className="flex items-center justify-between bg-slate-50 rounded-xl p-1 border border-slate-200 mt-auto">
                                                                <button onClick={() => updateExpiryCount(key, -1)} className="w-10 h-10 flex items-center justify-center bg-white rounded-lg shadow-sm text-slate-500 hover:text-rose-500 active:scale-95 transition-all"><Minus size={18}/></button>
                                                                <span className={`font-black text-lg ${qty > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{qty}</span>
                                                                <button onClick={() => updateExpiryCount(key, 1)} className="w-10 h-10 flex items-center justify-center bg-rose-600 rounded-lg shadow-sm text-white active:scale-95 transition-all"><Plus size={18}/></button>
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
                                            <h3 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                <RefreshCw size={14}/> Pure Refill Tasks
                                            </h3>
                                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                                {groupedTargets.refill.map((t: any) => {
                                                    const key = t.article_number;
                                                    const masterItem = masterCatalog.find(c => c.article_number === t.article_number);
                                                    const qty = expiryCounts[key] || 0;

                                                    return (
                                                        <div key={key} className={`bg-white rounded-3xl p-3 shadow-sm border flex flex-col gap-3 relative transition-all ${qty > 0 ? 'border-emerald-400 ring-4 ring-emerald-50' : 'border-slate-200'}`}>
                                                            <div className="w-full aspect-square bg-slate-50 rounded-2xl overflow-hidden flex items-center justify-center p-4">
                                                                {masterItem?.image_url ? <img src={masterItem.image_url} className="w-full h-full object-contain drop-shadow-sm" /> : <Wine size={32} className="text-slate-300"/>}
                                                            </div>
                                                            <div className="flex flex-col flex-1 px-1 text-center">
                                                                <h4 className="text-sm font-black text-slate-800 leading-tight line-clamp-2">{t.article_name}</h4>
                                                                <div className="mt-1.5">
                                                                    <span className="text-[8px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                                                                        Refill Needed
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center justify-between bg-slate-50 rounded-xl p-1 border border-slate-200 mt-auto">
                                                                <button onClick={() => updateExpiryCount(key, -1)} className="w-10 h-10 flex items-center justify-center bg-white rounded-lg shadow-sm text-slate-500 hover:text-rose-500 active:scale-95 transition-all"><Minus size={18}/></button>
                                                                <span className={`font-black text-lg ${qty > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{qty}</span>
                                                                <button onClick={() => updateExpiryCount(key, 1)} className="w-10 h-10 flex items-center justify-center bg-emerald-600 rounded-lg shadow-sm text-white active:scale-95 transition-all"><Plus size={18}/></button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                            
                            <div className="fixed bottom-24 md:bottom-0 left-0 right-0 md:left-64 p-4 md:p-6 bg-white/90 backdrop-blur-xl border-t border-slate-200 z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] pb-safe">
                                <div className="max-w-5xl mx-auto flex gap-3">
                                    <button 
                                        onClick={() => submitExpiryRemovals('All OK')} 
                                        disabled={isSaving} 
                                        className="flex-1 py-5 text-emerald-700 bg-emerald-50 rounded-2xl font-black uppercase tracking-widest border border-emerald-200 active:scale-95 transition-all flex flex-col items-center justify-center gap-1 leading-none"
                                    >
                                        {isSaving ? <Loader2 className="animate-spin" size={24}/> : <><span>{expiryVillaData[selectedVilla]?.status === 'All OK' ? 'Confirm OK' : 'None Found'}</span><span className="text-[9px] opacity-70">(All OK)</span></>}
                                    </button>
                                    <button 
                                        onClick={() => submitExpiryRemovals('Removed')} 
                                        disabled={isSaving || (groupedTargets.expiry.length === 0 && groupedTargets.refill.length === 0) || Object.values(expiryCounts).every(v => v === 0)} 
                                        className="flex-[1.5] py-5 text-white bg-rose-600 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-rose-600/20 active:scale-95 transition-all flex flex-col items-center justify-center gap-1 leading-none disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isSaving ? <Loader2 className="animate-spin" size={24}/> : <><span>Record Actions</span><span className="text-[9px] opacity-70">(Needs Refill)</span></>}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                ) : (
                    // --- STANDARD INVENTORY MODE (UNIVERSAL + KEYPAD) ---
                    <>
                        {/* SEARCH BAR */}
                        <div className="relative mb-4">
                            <Search className="absolute left-4 top-3.5 text-slate-400" size={18}/>
                            <input 
                                type="text" 
                                placeholder="Search items by name or code..." 
                                className="w-full pl-11 pr-10 py-3.5 bg-white border border-slate-200 rounded-2xl font-bold text-[16px] md:text-sm outline-none focus:border-[#6D2158] shadow-sm"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            {searchQuery && (
                                <button onClick={() => setSearchQuery('')} className="absolute right-4 top-3.5 text-slate-300 hover:text-slate-500">
                                    <X size={18}/>
                                </button>
                            )}
                        </div>

                        {/* DYNAMIC VILLA LOCATION TABS */}
                        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-4 mb-2 border-b border-slate-100">
                            {locationFilters.map(loc => (
                                <button 
                                    key={loc} 
                                    onClick={() => setActiveLocation(loc)}
                                    className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all border shadow-sm flex items-center gap-1.5 ${activeLocation === loc ? 'bg-[#6D2158] text-white border-[#6D2158]' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
                                >
                                    {loc !== 'All' && loc !== 'Unassigned' && <MapPin size={12}/>}
                                    {loc}
                                </button>
                            ))}
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4 pb-48">
                            {displayCatalog.length === 0 ? (
                                <div className="col-span-full py-10 text-center text-slate-400 font-bold">No items found.</div>
                            ) : displayCatalog.map(item => {
                                const qty = counts[item.article_number] || 0;
                                const isKeypadActive = keypadTarget === item.article_number;
                                
                                return (
                                <div key={item.article_number} className={`bg-white rounded-3xl p-3 shadow-sm border flex flex-col gap-3 relative transition-all ${qty > 0 || isKeypadActive ? 'border-[#6D2158] ring-4 ring-[#6D2158]/5' : 'border-slate-200'}`}>
                                    
                                    <div className="w-full aspect-square bg-slate-50 rounded-2xl overflow-hidden flex items-center justify-center p-3 relative">
                                        {item.image_url ? <img src={item.image_url} className="w-full h-full object-contain drop-shadow-sm"/> : <Wine size={32} className="text-slate-300"/>}
                                    </div>
                                    
                                    <div className="flex flex-col flex-1 px-1">
                                        <h4 className="text-[11px] font-black text-slate-800 leading-tight line-clamp-2">{item.generic_name || item.article_name}</h4>
                                        <div className="flex items-center justify-between mt-1">
                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate">{item.category}</p>
                                            {item.villa_location && activeLocation === 'All' && (
                                                <p className="text-[8px] font-black text-[#6D2158] uppercase tracking-widest bg-purple-50 px-1.5 py-0.5 rounded truncate max-w-[60px]">{item.villa_location}</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between bg-slate-50 rounded-xl p-1 border border-slate-200 mt-auto">
                                        <button onClick={() => updateCount(item.article_number, -1)} className="w-9 h-9 flex items-center justify-center bg-white rounded-lg shadow-sm text-slate-500 hover:text-rose-500 active:scale-95 transition-all">
                                            <Minus size={16}/>
                                        </button>
                                        
                                        <button 
                                            onClick={() => openKeypad(item.article_number)} 
                                            className={`w-10 text-center font-black text-xl py-1 rounded-lg transition-colors ${qty > 0 ? 'text-[#6D2158]' : 'text-slate-400 hover:bg-slate-200'} ${isKeypadActive ? 'bg-[#6D2158]/10 text-[#6D2158] ring-2 ring-[#6D2158]' : ''}`}
                                        >
                                            {qty}
                                        </button>

                                        <button onClick={() => updateCount(item.article_number, 1)} className="w-9 h-9 flex items-center justify-center bg-[#6D2158] rounded-lg shadow-sm text-white active:scale-95 transition-all">
                                            <Plus size={16}/>
                                        </button>
                                    </div>
                                </div>
                            )})}
                        </div>

                        {/* Fixed Bottom Submit Bar */}
                        <div className="fixed bottom-24 md:bottom-0 left-0 right-0 md:left-64 p-4 md:p-6 bg-white/90 backdrop-blur-xl border-t border-slate-200 z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] pb-safe">
                            <div className="max-w-5xl mx-auto">
                                <button 
                                    onClick={requestSaveInventory} 
                                    disabled={isSaving} 
                                    className="w-full py-4 md:py-5 text-white bg-[#6D2158] shadow-purple-900/20 rounded-2xl font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
                                >
                                    {isSaving ? <Loader2 className="animate-spin" size={24}/> : <><Save size={20}/> Submit Audit</>}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        )}

        {/* --- BILINGUAL GUIDE MODAL --- */}
        {showGuideModal && (
            <div className="fixed inset-0 z-[130] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-200">
                <div className="bg-white w-full max-w-md rounded-[2.5rem] p-6 md:p-8 shadow-2xl animate-in zoom-in-95 flex flex-col max-h-[90vh]">
                    <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4 shrink-0 shadow-inner">
                        <Info size={32} />
                    </div>
                    <h3 className="text-xl font-black text-slate-800 mb-4 tracking-tight text-center shrink-0">
                        How to count / <span style={{ fontFamily: 'Faruma, sans-serif', fontWeight: 'normal' }}>ގުނާނެ ގޮތް</span>
                    </h3>
                    
                    <div className="text-sm text-slate-600 font-medium mb-6 space-y-4 bg-slate-50 p-4 md:p-5 rounded-2xl border border-slate-100 overflow-y-auto custom-scrollbar flex-1">
                        <div className="text-left">
                            <p className="font-black text-slate-800 mb-2">🇬🇧 English:</p>
                            <div className="space-y-3 text-xs md:text-sm">
                                <p>1. This is an inventory count. You must count exactly what is physically present. If there is 1 item, enter <b className="text-slate-800 text-base">'1'</b>. If it is missing or empty, enter <b className="text-slate-800 text-base">'0'</b>.</p>
                                <p>2. Use the <b className="text-slate-800 text-base">Location Tabs</b> at the top (e.g. Wardrobe, Bathroom) to check items room-by-room so nothing is missed.</p>
                                <p>3. Tap the <b className="text-[#6D2158] text-base">large number</b> to open the fast keypad, or use the <b className="text-slate-800 text-base">+/-</b> buttons to adjust the count.</p>
                                <p>4. Make sure you have checked every location before tapping <b className="text-[#6D2158] text-base">Submit Audit</b>.</p>
                            </div>
                        </div>
                        <div className="border-t border-slate-200 pt-4" dir="rtl">
                            <p className="text-slate-800 mb-3 font-bold" style={{ fontFamily: 'Faruma, sans-serif' }}>🇲🇻 ދިވެހި:</p>
                            <div className="space-y-3 text-sm md:text-base leading-loose text-justify" style={{ fontFamily: 'Faruma, sans-serif' }}>
                                <p>1. މިއީ އެސެޓް އިންވެންޓުރީއެވެ. ހުރިހާ އެންމެންވެސް އިންވެންޓްރީގައި ޖަހާނީ އެވަގުތު އެތަނުގައި ހުރި ތަކެތީގެ ސީދާ އަދަދެވެ. އެއްޗެއް ހުރިނަމަ <span className="font-bold text-slate-800 text-lg">'1'</span>  ނުވަތަ އެހުރި އަދަދެއް ޖަހާށެވެ. އަދި އެއްޗެއް  ހުސްވެފައިވާނަމަ <span className="font-bold text-slate-800 text-lg">'0'</span> ޖަހާށެވެ.</p>
                                <p>2. އިންވެންޓްރީ ނެގުމަށް ފަސޭހަ ކުރުމަށްޓަކައި، މަތީގައިވާ <span className="font-bold text-slate-800 text-lg">Location Tabs</span> (މިސާލަކަށް: ވެނިޓީ އޭރިއާ) ބޭނުންކޮށްގެން ލޮކޭޝަންތައް ވަކިވަކިން ބަލައި ފާސްކުރާށެވެ.</p>
                                <p>3. ކީޕޭޑް ބޭނުންކޮށްގެން އަވަހަށް ނަންބަރު ޖެހުމަށްޓަކައި ބޮޑުކޮށް ފެންނަ <span className="font-bold text-[#6D2158] text-lg">ނަންބަރަށް</span> ފިއްތާލާށެވެ. ނުވަތަ <span className="font-bold text-slate-800 text-lg">+/-</span> ބަޓަން ބޭނުންކޮށްގެން އަދަދުތަކަށް ބަދަލު ގެންނާށެވެ.</p>
                                <p>4. <span className="font-bold text-[#6D2158] text-lg">'ސަބްމިޓް އޮޑިޓް'</span> އަށް ފިއްތުމުގެ ކުރިން، ހުރިހާ ތަންތަނެއް ބަލައި ފާސްކުރެވުނުކަން ޔަގީންކުރާށެވެ.</p>
                            </div>
                        </div>
                    </div>

                    <button onClick={closeGuide} className="w-full py-4 text-white bg-[#6D2158] rounded-2xl font-black uppercase tracking-wider text-xs shadow-lg shadow-purple-900/20 active:scale-95 transition-all shrink-0 flex items-center justify-center gap-2">
                        I Understand <span className="opacity-50">/</span> <span style={{ fontFamily: 'Faruma, sans-serif', fontWeight: 'normal', fontSize: '16px' }} className="mt-1">ވިސްނިއްޖެ</span>
                    </button>
                </div>
            </div>
        )}

        {/* --- CUSTOM KEYPAD OVERLAY --- */}
        {keypadTarget && (
            <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex flex-col justify-end animate-in fade-in duration-200">
                <div className="absolute inset-0" onClick={saveKeypadValue}></div>
                <div className="bg-[#FDFBFD] w-full rounded-t-[2.5rem] p-6 pb-safe shadow-2xl animate-in slide-in-from-bottom-8 relative z-10">
                    
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h4 className="font-black text-slate-800 text-lg">Direct Input</h4>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                                {activeCatalog.find(c => c.article_number === keypadTarget)?.generic_name || 'Item'}
                            </p>
                        </div>
                        <div className="text-4xl font-black text-[#6D2158] bg-purple-50 px-6 py-2 rounded-2xl border border-purple-100">
                            {keypadValue}
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 mb-6">
                        {[1,2,3,4,5,6,7,8,9].map(num => (
                            <button key={num} onClick={() => handleKeypadPress(String(num))} className="py-4 bg-white rounded-2xl shadow-sm border border-slate-200 text-2xl font-black text-slate-700 active:scale-95 active:bg-slate-50 transition-all">
                                {num}
                            </button>
                        ))}
                        <button onClick={() => handleKeypadPress('CLR')} className="py-4 bg-rose-50 rounded-2xl border border-rose-100 text-sm font-black text-rose-600 uppercase tracking-widest active:scale-95 transition-all">
                            Clear
                        </button>
                        <button onClick={() => handleKeypadPress('0')} className="py-4 bg-white rounded-2xl shadow-sm border border-slate-200 text-2xl font-black text-slate-700 active:scale-95 active:bg-slate-50 transition-all">
                            0
                        </button>
                        <button onClick={() => handleKeypadPress('DEL')} className="py-4 bg-slate-100 rounded-2xl border border-slate-200 text-sm font-black text-slate-600 uppercase tracking-widest active:scale-95 transition-all">
                            Del
                        </button>
                    </div>

                    <button onClick={saveKeypadValue} className="w-full py-5 bg-[#6D2158] text-white rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl active:scale-95 transition-all">
                        Confirm Amount
                    </button>
                </div>
            </div>
        )}

        {/* --- CUSTOM CONFIRMATION MODAL --- */}
        {confirmModal.isOpen && (
            <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
                <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 text-center">
                    <h3 className={`text-2xl font-black mb-2 tracking-tight ${confirmModal.isDestructive ? 'text-rose-600' : 'text-[#6D2158]'}`}>
                        {confirmModal.title}
                    </h3>
                    <p className="text-sm text-slate-500 font-medium mb-8 leading-relaxed">
                        {confirmModal.message}
                    </p>
                    <div className="flex flex-col gap-3">
                        <button onClick={confirmModal.onConfirm} className={`w-full py-4 text-white rounded-2xl font-black uppercase tracking-wider text-xs shadow-lg active:scale-95 transition-all flex justify-center items-center gap-2 ${confirmModal.isDestructive ? 'bg-rose-600 shadow-rose-200' : 'bg-[#6D2158] shadow-purple-200'}`}>
                            <Save size={16}/> {confirmModal.confirmText}
                        </button>
                        <button onClick={() => setConfirmModal(prev => ({...prev, isOpen: false}))} className="w-full py-4 bg-slate-50 text-slate-500 rounded-2xl font-bold uppercase tracking-wider text-xs active:scale-95 transition-all hover:bg-slate-100">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* --- SUCCESS OVERLAY --- */}
        {showSuccess && (
            <div className="fixed inset-0 z-[90] bg-emerald-600 flex flex-col items-center justify-center text-white p-8 animate-in fade-in zoom-in-95 duration-300">
                <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mb-6">
                    <CheckCircle2 size={64} className="text-white"/>
                </div>
                <h2 className="text-4xl font-black text-center mb-2">Saved!</h2>
                <p className="text-center font-medium text-emerald-100 mb-12 text-lg">Location {selectedVilla} record has been logged.</p>
                
                <button onClick={resetFlow} className="px-10 py-5 bg-white text-emerald-700 rounded-2xl font-black uppercase tracking-widest shadow-2xl active:scale-95 transition-all hover:scale-105">
                    Log Next Task
                </button>
            </div>
        )}

      </div>
    </div>
  );
}
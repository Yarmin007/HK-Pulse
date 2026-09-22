'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import PageHeader from '@/components/PageHeader';
import { 
  Users, 
  Calendar, 
  Plus, 
  Trash2, 
  Save, 
  Printer, 
  UserPlus, 
  Settings2, 
  CheckCircle2, 
  History, 
  Edit3, 
  FileSpreadsheet,
  X,
  Search,
  Archive,
  UserCheck,
  UserMinus,
  Lock,
  Unlock,
  RotateCcw,
  AlertTriangle
} from 'lucide-react';

export type CasualCategory = 'CASUAL-HOUSEKEEPING' | 'CASUAL-GARDENERS' | 'GARDEN-CASUAL-LADIES';
export type EmploymentStatus = 'Active' | 'Notice Period' | 'Resigned' | 'Terminated' | 'Archived';

interface CasualHost {
  id: string;
  name: string;
  category: CasualCategory;
  designation: string;
  usual_off_day: string;
  day_rate: number;
  joined_date?: string | null;
  left_date?: string | null;
  employment_status: EmploymentStatus;
  is_active: boolean;
}

interface StandardHost {
  id: string;
  name: string;
  position: string;
}

interface SheetHistoryItem {
  id: string;
  cycle_month: string;
  sheet_type: 'MAIN_CASUAL' | 'GARDEN_CASUAL_LADIES';
  total_hosts: number;
  day_rate: number;
  is_finalized?: boolean;
  created_at: string;
  prepared_by_name?: string;
  prepared_by_title?: string;
  checked_by_name?: string;
  checked_by_title?: string;
  approved_by_name?: string;
  approved_by_title?: string;
  attendance_data: Record<string, Record<string, string>>;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function CasualAttendancePage() {
  const [activeTab, setActiveTab] = useState<'sheet' | 'registry' | 'history'>('sheet');
  const [activeSheetType, setActiveSheetType] = useState<'MAIN_CASUAL' | 'GARDEN_CASUAL_LADIES'>('MAIN_CASUAL');

  const [hosts, setHosts] = useState<CasualHost[]>([]);
  const [standardHosts, setStandardHosts] = useState<StandardHost[]>([]);
  const [attendance, setAttendance] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [isSheetFinalized, setIsSheetFinalized] = useState(false);
  const [historyList, setHistoryList] = useState<SheetHistoryItem[]>([]);

  // Registry Search & Filter
  const [registrySearch, setRegistrySearch] = useState('');
  const [registryStatusFilter, setRegistryStatusFilter] = useState<'ALL' | 'ACTIVE_NOTICE' | 'ARCHIVED'>('ACTIVE_NOTICE');

  // Direct Sign-off Values
  const [preparedName, setPreparedName] = useState('Abdulla Yamin');
  const [preparedTitle, setPreparedTitle] = useState('Housekeeping Coordinator');

  const [checkedName, setCheckedName] = useState('Adam Thalhath');
  const [checkedTitle, setCheckedTitle] = useState('Manager of Sustainable Land Use / Landscaping');

  const [approvedName, setApprovedName] = useState('Aminath Nadheema');
  const [approvedTitle, setApprovedTitle] = useState('Executive Housekeeper');

  // Sheet Header Details
  const [departmentTitle, setDepartmentTitle] = useState('HOUSEKEEPING');
  const [globalDayRate, setGlobalDayRate] = useState('20.27');

  // Payroll Month Selector
  const [payrollMonth, setPayrollMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // Modal State for Add & Edit Casual Host
  const [showHostModal, setShowHostModal] = useState(false);
  const [editingHostId, setEditingHostId] = useState<string | null>(null);
  const [hostFormData, setHostFormData] = useState<{
    name: string;
    category: CasualCategory;
    designation: string;
    usual_off_day: string;
    day_rate: number;
    joined_date: string;
    left_date: string;
    employment_status: EmploymentStatus;
  }>({
    name: '',
    category: 'CASUAL-GARDENERS',
    designation: 'Casual Gardener',
    usual_off_day: 'Friday',
    day_rate: 20.27,
    joined_date: '',
    left_date: '',
    employment_status: 'Active'
  });

  // Quick Resign/Terminate Modal State
  const [showResignModal, setShowResignModal] = useState(false);
  const [resigningHost, setResigningHost] = useState<CasualHost | null>(null);
  const [resignData, setResignData] = useState<{
    status: EmploymentStatus;
    left_date: string;
    archiveImmediately: boolean;
  }>({
    status: 'Resigned',
    left_date: new Date().toISOString().split('T')[0],
    archiveImmediately: false
  });

  // Calculate 21st of Previous Month to 20th of Payroll Month
  const cycleDays = useMemo(() => {
    const [endY, endM] = payrollMonth.split('-').map(Number);
    const prevM = endM === 1 ? 12 : endM - 1;
    const prevY = endM === 1 ? endY - 1 : endY;

    const days: { 
      dateStr: string; 
      dayNum: number; 
      weekdayShort: string; 
      weekdayFull: string;
    }[] = [];

    const prevMonthDays = new Date(prevY, prevM, 0).getDate();
    for (let d = 21; d <= prevMonthDays; d++) {
      const dt = new Date(prevY, prevM - 1, d);
      days.push({
        dateStr: `${prevY}-${String(prevM).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        dayNum: d,
        weekdayShort: dt.toLocaleDateString('en-US', { weekday: 'narrow' }),
        weekdayFull: dt.toLocaleDateString('en-US', { weekday: 'long' })
      });
    }

    for (let d = 1; d <= 20; d++) {
      const dt = new Date(endY, endM - 1, d);
      days.push({
        dateStr: `${endY}-${String(endM).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        dayNum: d,
        weekdayShort: dt.toLocaleDateString('en-US', { weekday: 'narrow' }),
        weekdayFull: dt.toLocaleDateString('en-US', { weekday: 'long' })
      });
    }

    return days;
  }, [payrollMonth]);

  const cycleHeaderRange = useMemo(() => {
    if (cycleDays.length === 0) return '';
    const firstDate = new Date(cycleDays[0].dateStr);
    const lastDate = new Date(cycleDays[cycleDays.length - 1].dateStr);
    const m1 = firstDate.toLocaleDateString('en-US', { month: 'long' });
    const m2 = lastDate.toLocaleDateString('en-US', { month: 'long' });
    const y2 = lastDate.getFullYear();
    return `${m1} 21 to ${m2} 20, ${y2}`;
  }, [cycleDays]);

  const payrollMonthLabel = useMemo(() => {
    const [y, m] = payrollMonth.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [payrollMonth]);

  useEffect(() => {
    loadData();
  }, [payrollMonth, activeSheetType]);

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Fetch permanent hosts from hsk_hosts
      let parsedHosts: StandardHost[] = [];
      const { data: hskData } = await supabase.from('hsk_hosts').select('*');
      
      if (hskData && hskData.length > 0) {
        parsedHosts = hskData.map((h: any) => {
          const fullName = h.name || h.full_name || `${h.first_name || ''} ${h.last_name || ''}`.trim() || 'Staff Host';
          const pos = h.designation || h.position || h.job_title || h.role || 'Host';
          return { id: String(h.id), name: fullName, position: pos };
        });
      } else {
        const { data: fallbackData } = await supabase.from('hosts').select('*');
        if (fallbackData && fallbackData.length > 0) {
          parsedHosts = fallbackData.map((h: any) => ({
            id: String(h.id),
            name: h.name || h.full_name || `${h.first_name || ''} ${h.last_name || ''}`.trim() || 'Staff Host',
            position: h.designation || h.position || 'Host'
          }));
        }
      }

      parsedHosts.sort((a, b) => a.name.localeCompare(b.name));
      setStandardHosts(parsedHosts);

      // 2. Fetch Casual Hosts
      const { data: casualData } = await supabase
        .from('casual_hosts')
        .select('*')
        .order('category', { ascending: true })
        .order('name', { ascending: true });

      const loadedCasual: CasualHost[] = (casualData || []).map((h: any) => ({
        ...h,
        employment_status: (h.employment_status || (h.is_active === false ? 'Archived' : 'Active')) as EmploymentStatus
      }));
      setHosts(loadedCasual);

      // 3. Fetch Saved Sheet / History Snapshot
      const { data: sheetSaved } = await supabase
        .from('casual_attendance_sheets')
        .select('*')
        .eq('cycle_month', payrollMonth)
        .eq('sheet_type', activeSheetType)
        .maybeSingle();

      const { data: allHistory } = await supabase
        .from('casual_attendance_sheets')
        .select('*')
        .order('cycle_month', { ascending: false });

      setHistoryList((allHistory as any) || []);

      if (sheetSaved && sheetSaved.attendance_data) {
        setAttendance(sheetSaved.attendance_data);
        setIsSheetFinalized(Boolean(sheetSaved.is_finalized));
        if (sheetSaved.day_rate) setGlobalDayRate(String(sheetSaved.day_rate));
        if (sheetSaved.department_title) setDepartmentTitle(sheetSaved.department_title);
        if (sheetSaved.prepared_by_name) setPreparedName(sheetSaved.prepared_by_name);
        if (sheetSaved.prepared_by_title) setPreparedTitle(sheetSaved.prepared_by_title);
        if (sheetSaved.checked_by_name) setCheckedName(sheetSaved.checked_by_name);
        if (sheetSaved.checked_by_title) setCheckedTitle(sheetSaved.checked_by_title);
        if (sheetSaved.approved_by_name) setApprovedName(sheetSaved.approved_by_name);
        if (sheetSaved.approved_by_title) setApprovedTitle(sheetSaved.approved_by_title);
      } else {
        setIsSheetFinalized(false);
        if (cycleDays.length > 0) {
          const startDate = cycleDays[0].dateStr;
          const endDate = cycleDays[cycleDays.length - 1].dateStr;

          const { data: attData } = await supabase
            .from('casual_attendance_records')
            .select('*')
            .gte('date', startDate)
            .lte('date', endDate);

          const attMap: Record<string, Record<string, string>> = {};
          attData?.forEach((rec: any) => {
            if (!attMap[rec.casual_host_id]) attMap[rec.casual_host_id] = {};
            attMap[rec.casual_host_id][rec.date] = rec.status;
          });

          // Pre-fill default status based on usual off-day & joined/left dates
          loadedCasual.forEach(h => {
            if (!attMap[h.id]) attMap[h.id] = {};
            cycleDays.forEach(day => {
              if (!attMap[h.id][day.dateStr]) {
                const isBlackout = isDayBlackedOut(day.dateStr, h.joined_date, h.left_date);
                if (isBlackout) {
                  attMap[h.id][day.dateStr] = '-';
                } else {
                  const isOff = h.usual_off_day && h.usual_off_day.toLowerCase() === day.weekdayFull.toLowerCase();
                  attMap[h.id][day.dateStr] = isOff ? 'O' : 'P';
                }
              }
            });
          });

          setAttendance(attMap);
        }
      }
    } catch (err) {
      console.error('Error loading casual attendance data:', err);
    } finally {
      setLoading(false);
    }
  };

  const isDayBlackedOut = (dateStr: string, joined?: string | null, left?: string | null) => {
    if (joined && dateStr < joined) return true;
    if (left && dateStr > left) return true;
    return false;
  };

  // Helper to recalculate a specific host's off-days on current sheet
  const recomputeHostOffDays = (hostId: string, offDay: string, joined?: string | null, left?: string | null) => {
    setAttendance(prev => {
      const currentHostAtt = { ...(prev[hostId] || {}) };
      cycleDays.forEach(day => {
        const isBlackout = isDayBlackedOut(day.dateStr, joined, left);
        if (isBlackout) {
          currentHostAtt[day.dateStr] = '-';
        } else {
          const isOff = offDay && offDay.toLowerCase() === day.weekdayFull.toLowerCase();
          // Retain manual SL or A, but re-align O and P to new off day
          const curVal = currentHostAtt[day.dateStr];
          if (curVal === 'SL' || curVal === 'A') {
            // Keep sick or absent
          } else {
            currentHostAtt[day.dateStr] = isOff ? 'O' : 'P';
          }
        }
      });
      return { ...prev, [hostId]: currentHostAtt };
    });
  };

  // Reset ALL hosts on current sheet to their registered default off days
  const handleResetToDefaultOffDays = () => {
    if (isSheetFinalized) {
      alert('This sheet is locked. Unlock it first to reset off days.');
      return;
    }
    if (!confirm('Re-align all workers to their registered Usual Off Days for this payroll month? (Manual SL and A will be kept).')) return;

    setAttendance(prev => {
      const updated = { ...prev };
      currentSheetHosts.forEach(host => {
        const hostAtt = { ...(updated[host.id] || {}) };
        cycleDays.forEach(day => {
          const isBlackout = isDayBlackedOut(day.dateStr, host.joined_date, host.left_date);
          if (isBlackout) {
            hostAtt[day.dateStr] = '-';
          } else {
            const cur = hostAtt[day.dateStr];
            if (cur === 'SL' || cur === 'A') {
              // keep
            } else {
              const isOff = host.usual_off_day && host.usual_off_day.toLowerCase() === day.weekdayFull.toLowerCase();
              hostAtt[day.dateStr] = isOff ? 'O' : 'P';
            }
          }
        });
        updated[host.id] = hostAtt;
      });
      return updated;
    });
  };

  const openAddHostModal = () => {
    setEditingHostId(null);
    setHostFormData({
      name: '',
      category: 'CASUAL-GARDENERS',
      designation: 'Casual Gardener',
      usual_off_day: 'Friday',
      day_rate: 20.27,
      joined_date: '',
      left_date: '',
      employment_status: 'Active'
    });
    setShowHostModal(true);
  };

  const openEditHostModal = (host: CasualHost) => {
    setEditingHostId(host.id);
    setHostFormData({
      name: host.name,
      category: host.category,
      designation: host.designation,
      usual_off_day: host.usual_off_day || 'Friday',
      day_rate: host.day_rate || 20.27,
      joined_date: host.joined_date || '',
      left_date: host.left_date || '',
      employment_status: host.employment_status || 'Active'
    });
    setShowHostModal(true);
  };

  const openQuickResignModal = (host: CasualHost) => {
    setResigningHost(host);
    setResignData({
      status: host.employment_status === 'Active' ? 'Resigned' : host.employment_status,
      left_date: host.left_date || new Date().toISOString().split('T')[0],
      archiveImmediately: false
    });
    setShowResignModal(true);
  };

  const handleSaveResignModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resigningHost) return;

    try {
      const finalStatus = resignData.archiveImmediately ? 'Archived' : resignData.status;
      const isActive = !resignData.archiveImmediately && finalStatus !== 'Archived';

      const { error } = await supabase
        .from('casual_hosts')
        .update({
          employment_status: finalStatus,
          left_date: resignData.left_date || null,
          is_active: isActive
        })
        .eq('id', resigningHost.id);

      if (error) throw error;

      setShowResignModal(false);
      setResigningHost(null);
      loadData();
    } catch (err) {
      console.error('Error updating status:', err);
      alert('Failed to update host status.');
    }
  };

  const handleSaveHostForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hostFormData.name.trim()) return;

    try {
      const isArchived = hostFormData.employment_status === 'Archived';

      if (editingHostId) {
        const { error } = await supabase
          .from('casual_hosts')
          .update({
            name: hostFormData.name.trim(),
            category: hostFormData.category,
            designation: hostFormData.designation.trim(),
            usual_off_day: hostFormData.usual_off_day,
            day_rate: Number(hostFormData.day_rate) || 20.27,
            joined_date: hostFormData.joined_date || null,
            left_date: hostFormData.left_date || null,
            employment_status: hostFormData.employment_status,
            is_active: !isArchived
          })
          .eq('id', editingHostId);

        if (error) throw error;

        // If sheet is unlocked, dynamically re-apply their off-day so it takes effect immediately!
        if (!isSheetFinalized) {
          recomputeHostOffDays(
            editingHostId,
            hostFormData.usual_off_day,
            hostFormData.joined_date,
            hostFormData.left_date
          );
        }
      } else {
        const { data: newInserted, error } = await supabase
          .from('casual_hosts')
          .insert([{
            name: hostFormData.name.trim(),
            category: hostFormData.category,
            designation: hostFormData.designation.trim(),
            usual_off_day: hostFormData.usual_off_day,
            day_rate: Number(hostFormData.day_rate) || 20.27,
            joined_date: hostFormData.joined_date || null,
            left_date: hostFormData.left_date || null,
            employment_status: hostFormData.employment_status,
            is_active: !isArchived
          }])
          .select()
          .single();

        if (error) throw error;

        if (newInserted && !isSheetFinalized) {
          recomputeHostOffDays(
            newInserted.id,
            hostFormData.usual_off_day,
            hostFormData.joined_date,
            hostFormData.left_date
          );
        }
      }

      setShowHostModal(false);
      setEditingHostId(null);
      loadData();
    } catch (err) {
      console.error('Error saving casual host:', err);
      alert('Failed to save host details.');
    }
  };

  const handleDeleteHost = async (id: string) => {
    if (!confirm('Are you sure you want to deactivate this casual host?')) return;
    await supabase.from('casual_hosts').update({ is_active: false, employment_status: 'Archived' }).eq('id', id);
    setHosts(prev => prev.filter(h => h.id !== id));
  };

  const setCellStatus = (hostId: string, dateStr: string, value: string) => {
    if (isSheetFinalized) {
      alert('This sheet is finalized & locked. Click "Unlock Sheet" to make changes.');
      return;
    }
    const sanitized = value.trim().toUpperCase();
    setAttendance(prev => ({
      ...prev,
      [hostId]: {
        ...(prev[hostId] || {}),
        [dateStr]: sanitized
      }
    }));
  };

  const handleSaveAttendance = async (finalizedState?: boolean) => {
    setSaving(true);
    try {
      const recordsToUpsert: any[] = [];
      Object.keys(attendance).forEach(hostId => {
        Object.keys(attendance[hostId]).forEach(dateStr => {
          recordsToUpsert.push({
            casual_host_id: hostId,
            date: dateStr,
            status: attendance[hostId][dateStr]
          });
        });
      });

      if (recordsToUpsert.length > 0) {
        await supabase
          .from('casual_attendance_records')
          .upsert(recordsToUpsert, { onConflict: 'casual_host_id,date' });
      }

      const isLocked = finalizedState !== undefined ? finalizedState : isSheetFinalized;

      await supabase.from('casual_attendance_sheets').upsert({
        cycle_month: payrollMonth,
        sheet_type: activeSheetType,
        department_title: departmentTitle,
        day_rate: Number(globalDayRate) || 20.27,
        prepared_by_name: preparedName,
        prepared_by_title: preparedTitle,
        checked_by_name: checkedName,
        checked_by_title: checkedTitle,
        approved_by_name: approvedName,
        approved_by_title: approvedTitle,
        attendance_data: attendance,
        is_finalized: isLocked,
        total_hosts: currentSheetHosts.length
      }, { onConflict: 'cycle_month,sheet_type' });

      setIsSheetFinalized(isLocked);
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 3000);
      loadData();
    } catch (err) {
      console.error('Error saving attendance:', err);
      alert('Failed to save attendance sheet.');
    } finally {
      setSaving(false);
    }
  };

  const toggleFinalizeLock = async () => {
    const nextState = !isSheetFinalized;
    if (nextState) {
      const confirmLock = confirm(
        `Finalize & lock ${payrollMonthLabel} sheet?\n\nOnce locked, this sheet is preserved permanently as a frozen snapshot and will not be altered by future off-day or status registry changes.`
      );
      if (!confirmLock) return;
    }
    await handleSaveAttendance(nextState);
  };

  const currentCycleStart = cycleDays[0]?.dateStr || '';
  const currentCycleEnd = cycleDays[cycleDays.length - 1]?.dateStr || '';

  const activeInCycleHosts = useMemo(() => {
    return hosts.filter(h => {
      if (h.joined_date && currentCycleEnd && h.joined_date > currentCycleEnd) return false;
      if (h.left_date && currentCycleStart && h.left_date < currentCycleStart) return false;

      if (h.employment_status === 'Archived' || h.employment_status === 'Resigned' || h.employment_status === 'Terminated') {
        if (!h.left_date || (currentCycleStart && h.left_date < currentCycleStart)) return false;
      }

      return true;
    });
  }, [hosts, currentCycleStart, currentCycleEnd]);

  // Group active hosts for current sheet
  const mainSheetHosts = activeInCycleHosts.filter(h => h.category === 'CASUAL-HOUSEKEEPING' || h.category === 'CASUAL-GARDENERS');
  const ladiesSheetHosts = activeInCycleHosts.filter(h => h.category === 'GARDEN-CASUAL-LADIES');
  const currentSheetHosts = activeSheetType === 'MAIN_CASUAL' ? mainSheetHosts : ladiesSheetHosts;

  const hkHosts = currentSheetHosts.filter(h => h.category === 'CASUAL-HOUSEKEEPING');
  const gardenerHosts = currentSheetHosts.filter(h => h.category === 'CASUAL-GARDENERS');
  const ladiesHosts = currentSheetHosts.filter(h => h.category === 'GARDEN-CASUAL-LADIES');

  // Filter for Registry Tab
  const filteredRegistryHosts = useMemo(() => {
    return hosts.filter(h => {
      const matchSearch = h.name.toLowerCase().includes(registrySearch.toLowerCase()) || 
                          h.designation.toLowerCase().includes(registrySearch.toLowerCase());
      if (!matchSearch) return false;

      if (registryStatusFilter === 'ACTIVE_NOTICE') {
        return h.employment_status === 'Active' || h.employment_status === 'Notice Period';
      }
      if (registryStatusFilter === 'ARCHIVED') {
        return h.employment_status === 'Archived' || h.employment_status === 'Resigned' || h.employment_status === 'Terminated';
      }
      return true;
    });
  }, [hosts, registrySearch, registryStatusFilter]);

  const renderCategoryRows = (categoryHosts: CasualHost[], title: string, startIdx: number) => {
    if (categoryHosts.length === 0) return null;

    return (
      <React.Fragment key={title}>
        <tr className="bg-amber-100/70 border-y border-amber-300 font-bold text-[10px] tracking-wider print:bg-gray-200">
          <td colSpan={cycleDays.length + 9} className="py-1 px-2 text-left uppercase text-gray-800">
            {title} ({categoryHosts.length})
          </td>
        </tr>

        {categoryHosts.map((host, idx) => {
          const hostAtt = attendance[host.id] || {};
          let pCount = 0;
          let oCount = 0;
          let slCount = 0;
          let aCount = 0;
          let activeWorkingDaysInMonth = 0;

          cycleDays.forEach(d => {
            const isBlackout = isDayBlackedOut(d.dateStr, host.joined_date, host.left_date);
            const st = hostAtt[d.dateStr];

            if (!isBlackout) {
              activeWorkingDaysInMonth++;
              if (st === 'P') pCount++;
              else if (st === 'O') oCount++;
              else if (st === 'SL') slCount++;
              else if (st === 'A') aCount++;
            }
          });

          const totalDaysCalculated = Math.max(0, activeWorkingDaysInMonth - aCount);
          const wagesApplied = pCount + oCount;

          return (
            <tr key={host.id} className="border-b border-gray-300 hover:bg-gray-50/70 text-[10.5px]">
              <td className="py-0.5 px-1 text-center text-gray-500 font-medium border-r border-gray-300">
                {startIdx + idx + 1}
              </td>
              <td className="py-0.5 px-2 font-semibold text-gray-900 whitespace-nowrap border-r border-gray-300">
                <div className="flex items-center gap-1.5">
                  <span>{host.name}</span>
                  {host.employment_status === 'Notice Period' && (
                    <span className="print:hidden text-[9px] px-1 py-0.2 bg-amber-100 text-amber-800 rounded font-normal">
                      Notice
                    </span>
                  )}
                </div>
              </td>
              <td className="py-0.5 px-2 text-gray-600 whitespace-nowrap border-r border-gray-300">
                {host.designation}
              </td>

              {/* Day cells 21st to 20th */}
              {cycleDays.map(d => {
                const isBlackout = isDayBlackedOut(d.dateStr, host.joined_date, host.left_date);
                const rawVal = hostAtt[d.dateStr] || '';
                const st = isBlackout ? '-' : rawVal || 'P';

                let cellColorClass = 'text-gray-900 bg-white';
                if (isBlackout) {
                  cellColorClass = 'bg-gray-900 text-white font-bold select-none cursor-not-allowed';
                } else if (st === 'O') {
                  cellColorClass = 'bg-emerald-100 text-emerald-900 font-bold';
                } else if (st === 'SL') {
                  cellColorClass = 'bg-rose-100 text-rose-900 font-bold';
                } else if (st === 'A') {
                  cellColorClass = 'bg-amber-200 text-amber-950 font-black';
                } else if (st === 'P') {
                  cellColorClass = 'bg-white text-gray-900 font-medium';
                }

                return (
                  <td 
                    key={d.dateStr}
                    className={`py-0.5 px-0 text-center border-r border-gray-300 ${cellColorClass}`}
                  >
                    {isBlackout ? (
                      <span className="text-[10px]">-</span>
                    ) : (
                      <input
                        type="text"
                        maxLength={2}
                        disabled={isSheetFinalized}
                        value={st}
                        onChange={(e) => setCellStatus(host.id, d.dateStr, e.target.value)}
                        className={`w-full text-center bg-transparent border-none focus:outline-none font-bold uppercase text-[10px] p-0 m-0 ${cellColorClass} disabled:cursor-not-allowed`}
                      />
                    )}
                  </td>
                );
              })}

              {/* Summary Columns */}
              <td className="py-0.5 px-1 text-center font-bold text-gray-900 bg-gray-50 border-r border-gray-300">
                {pCount}
              </td>
              <td className="py-0.5 px-1 text-center font-bold text-emerald-800 bg-emerald-50/50 border-r border-gray-300">
                {oCount}
              </td>
              <td className="py-0.5 px-1 text-center font-bold text-rose-800 bg-rose-50/50 border-r border-gray-300">
                {slCount}
              </td>
              <td className="py-0.5 px-1 text-center font-bold text-amber-900 bg-amber-50/60 border-r border-gray-300">
                {aCount}
              </td>
              <td className="py-0.5 px-1.5 text-center font-bold text-gray-900 bg-gray-100 border-r border-gray-300">
                {totalDaysCalculated}
              </td>
              <td className="py-0.5 px-1.5 text-center font-black text-blue-900 bg-blue-50/70">
                {wagesApplied}
              </td>
            </tr>
          );
        })}
      </React.Fragment>
    );
  };

  return (
    <div className="space-y-6 pb-20 max-w-full">
      {/* Top Header */}
      <div className="print:hidden">
        <PageHeader 
          title="Casual Attendance & Monthly Sheets" 
          subtitle="Cycle runs from 21st of previous month to 20th of payroll month with dedicated signing spaces."
        />
      </div>

      {/* Main Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm print:hidden">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('sheet')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
              activeTab === 'sheet' 
                ? 'bg-emerald-700 text-white shadow-sm' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Monthly Sheet
          </button>
          <button
            onClick={() => setActiveTab('registry')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'registry' 
                ? 'bg-emerald-700 text-white shadow-sm' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Settings2 className="w-4 h-4" />
            Casual Registry ({hosts.length})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'history' 
                ? 'bg-emerald-700 text-white shadow-sm' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <History className="w-4 h-4" />
            Saved History ({historyList.length})
          </button>
        </div>

        {activeTab === 'sheet' && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Sheet Type Toggle */}
            <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200">
              <button
                onClick={() => setActiveSheetType('MAIN_CASUAL')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${
                  activeSheetType === 'MAIN_CASUAL'
                    ? 'bg-white text-emerald-800 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                HK & Gardeners
              </button>
              <button
                onClick={() => setActiveSheetType('GARDEN_CASUAL_LADIES')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${
                  activeSheetType === 'GARDEN_CASUAL_LADIES'
                    ? 'bg-white text-rose-800 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Garden Casual Ladies
              </button>
            </div>

            {/* Payroll Month Picker */}
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-1 text-xs">
              <Calendar className="w-3.5 h-3.5 text-emerald-700" />
              <span className="text-gray-500 font-medium">Payroll Month:</span>
              <input 
                type="month" 
                value={payrollMonth} 
                onChange={e => setPayrollMonth(e.target.value)}
                className="bg-transparent font-bold text-gray-800 focus:outline-none cursor-pointer"
              />
            </div>

            {/* Reset to Default Off Days */}
            <button
              onClick={handleResetToDefaultOffDays}
              disabled={isSheetFinalized}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-300 rounded-lg shadow-sm transition disabled:opacity-40"
              title="Reset this sheet to match everyone's registered Usual Off Days"
            >
              <RotateCcw className="w-3 h-3 text-gray-500" />
              <span>Apply Off-Days</span>
            </button>

            {/* Lock / Finalize Button */}
            <button
              onClick={toggleFinalizeLock}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg shadow-sm border transition ${
                isSheetFinalized 
                  ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                  : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
              }`}
              title={isSheetFinalized ? 'Click to unlock for editing' : 'Lock to freeze and protect this month'}
            >
              {isSheetFinalized ? <Lock className="w-3.5 h-3.5 text-amber-700" /> : <Unlock className="w-3.5 h-3.5 text-gray-500" />}
              {isSheetFinalized ? 'Locked' : 'Lock'}
            </button>

            {/* Print A4 */}
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-lg shadow-sm"
            >
              <Printer className="w-3.5 h-3.5" />
              Print A4
            </button>

            {/* Save Button */}
            <button
              onClick={() => handleSaveAttendance()}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg shadow transition disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Save Sheet'}
            </button>
          </div>
        )}

        {activeTab === 'registry' && (
          <button
            onClick={openAddHostModal}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg shadow transition"
          >
            <UserPlus className="w-4 h-4" />
            Add Casual Host
          </button>
        )}
      </div>

      {savedMsg && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-3 rounded-lg print:hidden">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          Casual attendance sheet successfully saved to database!
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 1: MONTHLY SHEET (Print-fit container)                 */}
      {/* ========================================================= */}
      {activeTab === 'sheet' && (
        <div className="space-y-4">
          {/* Sign-off Approver Control Bar (Screen Only) */}
          <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200 flex flex-wrap items-center justify-between gap-4 text-xs text-gray-700 print:hidden">
            <div className="flex flex-wrap items-center gap-6">
              <span className="font-bold text-gray-900">Sign-off Approvers:</span>
              
              {/* Prepared By */}
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-gray-700">Prepared by:</span>
                <div className="flex items-center gap-1.5">
                  <select 
                    value={standardHosts.find(h => h.name === preparedName)?.id || ''} 
                    onChange={e => {
                      const found = standardHosts.find(h => h.id === e.target.value);
                      if (found) {
                        setPreparedName(found.name);
                        setPreparedTitle(found.position);
                      }
                    }}
                    className="bg-white border border-gray-300 rounded px-2 py-1 text-xs font-medium text-gray-800 focus:ring-1 focus:ring-emerald-500 max-w-[170px]"
                  >
                    <option value="">-- Choose Host --</option>
                    {standardHosts.map(h => (
                      <option key={h.id} value={h.id}>
                        {h.name} ({h.position})
                      </option>
                    ))}
                  </select>

                  <input 
                    type="text"
                    placeholder="Or Type Name"
                    value={preparedName}
                    onChange={e => setPreparedName(e.target.value)}
                    className="bg-white border border-gray-300 rounded px-2 py-1 text-xs w-32 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Checked By */}
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-gray-700">Checked by:</span>
                <div className="flex items-center gap-1.5">
                  <select 
                    value={standardHosts.find(h => h.name === checkedName)?.id || ''} 
                    onChange={e => {
                      const found = standardHosts.find(h => h.id === e.target.value);
                      if (found) {
                        setCheckedName(found.name);
                        setCheckedTitle(found.position);
                      }
                    }}
                    className="bg-white border border-gray-300 rounded px-2 py-1 text-xs font-medium text-gray-800 focus:ring-1 focus:ring-emerald-500 max-w-[170px]"
                  >
                    <option value="">-- Choose Host --</option>
                    {standardHosts.map(h => (
                      <option key={h.id} value={h.id}>
                        {h.name} ({h.position})
                      </option>
                    ))}
                  </select>

                  <input 
                    type="text"
                    placeholder="Or Type Name"
                    value={checkedName}
                    onChange={e => setCheckedName(e.target.value)}
                    className="bg-white border border-gray-300 rounded px-2 py-1 text-xs w-32 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Approved By */}
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-gray-700">Approved by:</span>
                <div className="flex items-center gap-1.5">
                  <select 
                    value={standardHosts.find(h => h.name === approvedName)?.id || ''} 
                    onChange={e => {
                      const found = standardHosts.find(h => h.id === e.target.value);
                      if (found) {
                        setApprovedName(found.name);
                        setApprovedTitle(found.position);
                      }
                    }}
                    className="bg-white border border-gray-300 rounded px-2 py-1 text-xs font-medium text-gray-800 focus:ring-1 focus:ring-emerald-500 max-w-[170px]"
                  >
                    <option value="">-- Choose Host --</option>
                    {standardHosts.map(h => (
                      <option key={h.id} value={h.id}>
                        {h.name} ({h.position})
                      </option>
                    ))}
                  </select>

                  <input 
                    type="text"
                    placeholder="Or Type Name"
                    value={approvedName}
                    onChange={e => setApprovedName(e.target.value)}
                    className="bg-white border border-gray-300 rounded px-2 py-1 text-xs w-32 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* Lock Status Indicator */}
            {isSheetFinalized && (
              <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold">
                <Lock className="w-3.5 h-3.5" />
                Sheet is Locked
              </div>
            )}
          </div>

          {/* Printable Document Sheet Container */}
          <div id="print-sheet-area" className="bg-white rounded-xl border border-gray-400 shadow-sm p-4 print:p-0 print:border-none print:shadow-none">
            
            {/* Header matching official PDF */}
            <div className="border-b-2 border-gray-900 pb-2 mb-2 flex justify-between items-end">
              <div>
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                  SIX SENSES LAAMU
                </div>
                <div className="text-xs font-extrabold text-gray-900 uppercase mt-0.5">
                  Department: C/O {departmentTitle}
                </div>
                <h1 className="text-sm font-black text-gray-900 uppercase tracking-tight mt-0.5">
                  {activeSheetType === 'GARDEN_CASUAL_LADIES' 
                    ? 'Attendance Summary For Casual Workers (Garden Casual Ladies)' 
                    : 'Attendance Summary For Casual Workers'
                  }
                </h1>
              </div>

              <div className="text-right text-[11px] text-gray-900 font-bold space-y-0.5">
                <div>Payroll Month: <span className="text-emerald-800 font-black uppercase">{payrollMonthLabel}</span></div>
                <div className="text-[10px] text-gray-600 font-semibold">Period: {cycleHeaderRange}</div>
                <div>Day Rate: <span className="font-black">{globalDayRate} $</span></div>
              </div>
            </div>

            {/* Attendance Matrix Table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-400 text-[10px]">
                <thead>
                  <tr className="bg-gray-100 border-b border-gray-400 text-gray-800">
                    <th className="py-1 px-1 text-center w-7 font-bold border-r border-gray-300">S. No.</th>
                    <th className="py-1 px-2 text-left w-36 font-bold border-r border-gray-300">Name</th>
                    <th className="py-1 px-2 text-left w-32 font-bold border-r border-gray-300">Designation</th>

                    {cycleDays.map(d => (
                      <th key={d.dateStr} className="py-0.5 px-0.5 text-center min-w-[21px] border-r border-gray-300">
                        <div className="font-bold text-gray-900 text-[10px]">{d.dayNum}</div>
                        <div className="text-[7.5px] text-gray-500 uppercase font-semibold">{d.weekdayShort}</div>
                      </th>
                    ))}

                    <th className="py-1 px-1 text-center w-7 font-bold text-gray-900 bg-gray-50 border-r border-gray-300">P</th>
                    <th className="py-1 px-1 text-center w-7 font-bold text-emerald-800 bg-emerald-50/50 border-r border-gray-300">O</th>
                    <th className="py-1 px-1 text-center w-7 font-bold text-rose-800 bg-rose-50/50 border-r border-gray-300">SL</th>
                    <th className="py-1 px-1 text-center w-7 font-bold text-amber-900 bg-amber-50/50 border-r border-gray-300">A</th>
                    <th className="py-1 px-1.5 text-center w-11 font-bold bg-gray-100 border-r border-gray-300">Total days</th>
                    <th className="py-1 px-1.5 text-center w-14 font-black bg-blue-50 text-blue-900">days wages applied</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={cycleDays.length + 9} className="py-10 text-center text-gray-500">
                        Loading attendance records...
                      </td>
                    </tr>
                  ) : currentSheetHosts.length === 0 ? (
                    <tr>
                      <td colSpan={cycleDays.length + 9} className="py-10 text-center text-gray-500">
                        No casual hosts found for this period. Either all are archived or none joined.
                      </td>
                    </tr>
                  ) : activeSheetType === 'MAIN_CASUAL' ? (
                    <React.Fragment>
                      {renderCategoryRows(hkHosts, 'CASUAL - HOUSEKEEPING', 0)}
                      {renderCategoryRows(gardenerHosts, 'CASUAL - GARDENERS', hkHosts.length)}
                    </React.Fragment>
                  ) : (
                    renderCategoryRows(ladiesHosts, 'GARDEN CASUAL LADIES', 0)
                  )}
                </tbody>
              </table>
            </div>

            {/* Bottom Signature Section */}
            <div className="pt-3">
              <div className="flex justify-between items-center text-[10.5px] text-gray-600 mb-2">
                <div>Total Workers on Sheet: <strong className="text-gray-900">{currentSheetHosts.length}</strong></div>
                <div className="print:hidden text-[10.5px] text-gray-400">
                  Note: <strong>O</strong> (Off) is paid leave and included in Wages Applied. <strong>A</strong> (Absent), <strong>SL</strong> (Sick), and <strong>-</strong> (Blank) are deducted.
                </div>
              </div>

              {/* Three Signatures */}
              <div className="grid grid-cols-3 gap-12 pt-2 border-t border-gray-300 text-center text-[11px] text-gray-800">
                
                {/* PREPARED BY */}
                <div className="flex flex-col items-center">
                  <div className="font-bold text-gray-900 text-xs">Prepared by:</div>
                  <div className="h-16 w-full flex items-end justify-center pb-1">
                    <div className="w-48 border-b border-gray-400 border-dashed"></div>
                  </div>
                  <div className="text-xs font-extrabold text-gray-900">
                    {preparedName || '____________________'}
                  </div>
                  <div className="text-[10px] font-medium text-gray-500">
                    {preparedTitle || 'Housekeeping Coordinator'}
                  </div>
                </div>

                {/* CHECKED BY */}
                <div className="flex flex-col items-center">
                  <div className="font-bold text-gray-900 text-xs">Checked by:</div>
                  <div className="h-16 w-full flex items-end justify-center pb-1">
                    <div className="w-48 border-b border-gray-400 border-dashed"></div>
                  </div>
                  <div className="text-xs font-extrabold text-gray-900">
                    {checkedName || '____________________'}
                  </div>
                  <div className="text-[10px] font-medium text-gray-500">
                    {checkedTitle || 'Manager of Sustainable Land Use / Landscaping'}
                  </div>
                </div>

                {/* APPROVED BY */}
                <div className="flex flex-col items-center">
                  <div className="font-bold text-gray-900 text-xs">Approved by:</div>
                  <div className="h-16 w-full flex items-end justify-center pb-1">
                    <div className="w-48 border-b border-gray-400 border-dashed"></div>
                  </div>
                  <div className="text-xs font-extrabold text-gray-900">
                    {approvedName || '____________________'}
                  </div>
                  <div className="text-[10px] font-medium text-gray-500">
                    {approvedTitle || 'Executive Housekeeper'}
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: CASUAL REGISTRY (Search, Status, Easy Resign)      */}
      {/* ========================================================= */}
      {activeTab === 'registry' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-gray-900">Casual Workforce Directory</h3>
              <p className="text-xs text-gray-500 mt-0.5">Manage workers, search by name, set Notice Period / Leaving dates, and archive.</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Search Box */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input 
                  type="text"
                  placeholder="Search name or designation..."
                  value={registrySearch}
                  onChange={e => setRegistrySearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg text-xs w-48 sm:w-60 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* Status Filter */}
              <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200 text-xs">
                <button
                  onClick={() => setRegistryStatusFilter('ACTIVE_NOTICE')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition ${
                    registryStatusFilter === 'ACTIVE_NOTICE' ? 'bg-white text-emerald-800 shadow-sm' : 'text-gray-600'
                  }`}
                >
                  Active ({hosts.filter(h => h.employment_status === 'Active' || h.employment_status === 'Notice Period').length})
                </button>
                <button
                  onClick={() => setRegistryStatusFilter('ARCHIVED')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition ${
                    registryStatusFilter === 'ARCHIVED' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-600'
                  }`}
                >
                  Archived ({hosts.filter(h => h.employment_status === 'Archived' || h.employment_status === 'Resigned' || h.employment_status === 'Terminated').length})
                </button>
                <button
                  onClick={() => setRegistryStatusFilter('ALL')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition ${
                    registryStatusFilter === 'ALL' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-600'
                  }`}
                >
                  All ({hosts.length})
                </button>
              </div>

              <button
                onClick={openAddHostModal}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg transition"
              >
                <Plus className="w-4 h-4" />
                Add Host
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 font-semibold text-gray-600 uppercase">
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Designation</th>
                  <th className="py-3 px-4">Usual Off Day</th>
                  <th className="py-3 px-4">Joined Date</th>
                  <th className="py-3 px-4">Leaving Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRegistryHosts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-500">
                      No matching casual hosts found.
                    </td>
                  </tr>
                ) : (
                  filteredRegistryHosts.map(host => {
                    const isNotice = host.employment_status === 'Notice Period';
                    const isArchived = host.employment_status === 'Archived' || host.employment_status === 'Resigned' || host.employment_status === 'Terminated';

                    return (
                      <tr key={host.id} className="hover:bg-gray-50/60 transition">
                        <td className="py-2.5 px-4 font-bold text-gray-900">{host.name}</td>
                        <td className="py-2.5 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10.5px] font-bold ${
                            isNotice 
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : isArchived
                              ? 'bg-gray-200 text-gray-700 border border-gray-300'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}>
                            {host.employment_status}
                          </span>
                        </td>
                        <td className="py-2.5 px-4">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                            host.category === 'GARDEN-CASUAL-LADIES' 
                              ? 'bg-rose-50 text-rose-700 border-rose-200' 
                              : host.category === 'CASUAL-HOUSEKEEPING'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}>
                            {host.category}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-gray-700">{host.designation}</td>
                        <td className="py-2.5 px-4 font-semibold text-amber-700">{host.usual_off_day || 'None'}</td>
                        <td className="py-2.5 px-4 text-gray-600 font-medium">{host.joined_date || '-'}</td>
                        <td className="py-2.5 px-4 text-rose-600 font-medium">{host.left_date || '-'}</td>
                        <td className="py-2.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* EDIT BUTTON */}
                            <button
                              onClick={() => openEditHostModal(host)}
                              className="p-1.5 text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition"
                              title="Edit Host Details"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>

                            {/* QUICK RESIGN / TERMINATE ACTION */}
                            <button
                              onClick={() => openQuickResignModal(host)}
                              className="p-1.5 text-gray-400 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition"
                              title="Set Resigned / Terminated / Notice"
                            >
                              <UserMinus className="w-4 h-4" />
                            </button>

                            {/* DELETE BUTTON */}
                            <button
                              onClick={() => handleDeleteHost(host.id)}
                              className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                              title="Archive Host"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: MONTHLY HISTORY ARCHIVE                            */}
      {/* ========================================================= */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden p-4">
          <h3 className="font-bold text-gray-900 mb-1">Generated Sheets History</h3>
          <p className="text-xs text-gray-500 mb-4">View past monthly snapshots and load them directly into the sheet view.</p>

          <div className="divide-y divide-gray-100">
            {historyList.length === 0 ? (
              <div className="py-8 text-center text-gray-500 text-xs">
                No monthly attendance sheets saved yet. Use <strong>Save Sheet</strong> on the Monthly Sheet tab.
              </div>
            ) : (
              historyList.map(item => (
                <div key={item.id} className="py-3 flex items-center justify-between hover:bg-gray-50 px-2 rounded-lg transition">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-gray-900">Payroll Month: {item.cycle_month}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        item.sheet_type === 'GARDEN_CASUAL_LADIES' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {item.sheet_type === 'GARDEN_CASUAL_LADIES' ? 'Garden Casual Ladies' : 'HK & Gardeners'}
                      </span>
                      {item.is_finalized && (
                        <span className="flex items-center gap-1 px-1.5 py-0.2 bg-amber-100 text-amber-900 border border-amber-300 rounded text-[9.5px] font-bold">
                          <Lock className="w-2.5 h-2.5" /> Locked
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      Total Hosts: {item.total_hosts} • Day Rate: ${item.day_rate} • Prepared by: {item.prepared_by_name || 'Coordinator'}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setPayrollMonth(item.cycle_month);
                      setActiveSheetType(item.sheet_type);
                      setActiveTab('sheet');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-emerald-700 hover:text-white text-gray-700 rounded-lg text-xs font-semibold transition"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Open Sheet
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* QUICK RESIGN / TERMINATE MODAL                            */}
      {/* ========================================================= */}
      {showResignModal && resigningHost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 print:hidden">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-gray-100">
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-base font-bold text-gray-900">
                Update Leaving Status
              </h3>
              <button 
                onClick={() => setShowResignModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Set leaving details for <strong className="text-gray-800">{resigningHost.name}</strong>.
            </p>

            <form onSubmit={handleSaveResignModal} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Status</label>
                <select
                  value={resignData.status}
                  onChange={e => setResignData({ ...resignData, status: e.target.value as EmploymentStatus })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                >
                  <option value="Resigned">Resigned</option>
                  <option value="Notice Period">Notice Period (Serving Notice)</option>
                  <option value="Terminated">Terminated</option>
                  <option value="Archived">Archived (Hide Immediately)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Effective / Leaving Date</label>
                <input 
                  type="date"
                  required
                  value={resignData.left_date}
                  onChange={e => setResignData({ ...resignData, left_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-start gap-2 pt-1 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                <input 
                  type="checkbox"
                  id="archiveImmediately"
                  checked={resignData.archiveImmediately}
                  onChange={e => setResignData({ ...resignData, archiveImmediately: e.target.checked })}
                  className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="archiveImmediately" className="text-[11px] text-amber-900 leading-tight cursor-pointer">
                  <strong>Archive immediately:</strong> Check this if the person has already left and should not be included in upcoming month reports.
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowResignModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg shadow"
                >
                  Save Status
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* ADD / EDIT HOST MODAL                                     */}
      {/* ========================================================= */}
      {showHostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 print:hidden">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100">
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-base font-bold text-gray-900">
                {editingHostId ? 'Edit Casual Host' : 'Add Casual Host'}
              </h3>
              <button 
                onClick={() => setShowHostModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              {editingHostId ? 'Modify profile, designation, off-days, and timeline dates.' : 'Register a new casual worker with joining and leaving dates.'}
            </p>

            <form onSubmit={handleSaveHostForm} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Full Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. MD Nejam / Aminath"
                  value={hostFormData.name}
                  onChange={e => setHostFormData({ ...hostFormData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Employment Status</label>
                  <select
                    value={hostFormData.employment_status}
                    onChange={e => setHostFormData({ ...hostFormData, employment_status: e.target.value as EmploymentStatus })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                  >
                    <option value="Active">Active (Working)</option>
                    <option value="Notice Period">Notice Period (Serving Notice)</option>
                    <option value="Resigned">Resigned</option>
                    <option value="Terminated">Terminated</option>
                    <option value="Archived">Archived (Hide from report)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Category</label>
                  <select
                    value={hostFormData.category}
                    onChange={e => setHostFormData({ ...hostFormData, category: e.target.value as CasualCategory })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                  >
                    <option value="CASUAL-GARDENERS">CASUAL - GARDENERS</option>
                    <option value="CASUAL-HOUSEKEEPING">CASUAL - HOUSEKEEPING</option>
                    <option value="GARDEN-CASUAL-LADIES">GARDEN CASUAL LADIES</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Designation</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Casual Gardener / Casual - Laundry"
                  value={hostFormData.designation}
                  onChange={e => setHostFormData({ ...hostFormData, designation: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Usual Off Day</label>
                  <select
                    value={hostFormData.usual_off_day}
                    onChange={e => setHostFormData({ ...hostFormData, usual_off_day: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                  >
                    {WEEKDAYS.map(w => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                    <option value="None">None</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Day Rate ($)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={hostFormData.day_rate}
                    onChange={e => setHostFormData({ ...hostFormData, day_rate: parseFloat(e.target.value) || 20.27 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-0.5">Joined Date</label>
                  <span className="block text-[10px] text-gray-400 mb-1">Blackouts prior days</span>
                  <input 
                    type="date"
                    value={hostFormData.joined_date}
                    onChange={e => setHostFormData({ ...hostFormData, joined_date: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-0.5">Expected Leaving Date</label>
                  <span className="block text-[10px] text-gray-400 mb-1">Blackouts after days</span>
                  <input 
                    type="date"
                    value={hostFormData.left_date}
                    onChange={e => setHostFormData({ ...hostFormData, left_date: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowHostModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-700 text-white text-xs font-semibold rounded-lg hover:bg-emerald-800 shadow"
                >
                  {editingHostId ? 'Update Host' : 'Save to Registry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* PRINT STYLING: Landscape A4 Isolation & ZERO NAV BARS     */}
      {/* ========================================================= */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 5mm 4mm;
          }
          
          /* Hide app shell, navigation bars, headers, footers, and bottom bars */
          aside,
          nav,
          header,
          footer,
          .print\\:hidden,
          #sidebar,
          button,
          [class*="bottom-0"],
          [class*="BottomNav"],
          [class*="MobileNav"],
          [class*="tab-bar"] {
            display: none !important;
            visibility: hidden !important;
            height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          html, body {
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: auto !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          main {
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
          }

          #print-sheet-area {
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
          }

          table {
            font-size: 8px !important;
            width: 100% !important;
            border-collapse: collapse !important;
          }

          th, td {
            padding: 1px 0.5px !important;
          }

          input {
            border: none !important;
            background: transparent !important;
          }
        }
      `}</style>
    </div>
  );
}
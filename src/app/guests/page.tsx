"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Edit3, X, ChevronLeft, ChevronRight,
  FileSpreadsheet, Heart, ArrowRight, AlertTriangle, CheckCircle, Loader2, RotateCw, UploadCloud, User, Baby, ArrowRightLeft, Clock,
  Shirt, Trash2, Plus, Search, Eye, EyeOff, BedDouble, ShieldCheck, Link2
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

const TOTAL_VILLAS = 97;
const EXTENSION_VILLAS = ['56', '58', '88'];

const getToday = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatSyncDateTime = (dateInput: Date | string | number) => {
  const dt = new Date(dateInput);
  if (isNaN(dt.getTime())) return '';
  return dt.toLocaleString('en-GB', {
    timeZone: 'Asia/Dhaka',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const normalizeVilla = (raw: any): string | null => {
    if (!raw) return null;
    const str = String(raw).trim();
    const match = str.match(/^(\d{1,3})/); 
    if (!match) return null;
    return parseInt(match[1], 10).toString();
};

const extractTime = (val: any) => {
    if (!val) return "";
    const str = String(val).trim();
    const matchColon = str.match(/(\d{1,2}[:.]\d{2})/);
    if (matchColon) return matchColon[1].replace('.', ':');
    return "";
};

const monthToNum = (mStr: string) => {
    const months: {[key:string]: string} = {
        'JAN':'01', 'FEB':'02', 'MAR':'03', 'APR':'04', 'MAY':'05', 'JUN':'06',
        'JUL':'07', 'AUG':'08', 'SEP':'09', 'OCT':'10', 'NOV':'11', 'DEC':'12'
    };
    const upperM = (mStr || '').toUpperCase();
    return months[upperM] || mStr.padStart(2, '0');
};

const formatGuestName = (rawName: string, rawTitle: string = "", rawAgeNote: any = null) => {
  if (!rawName) return "";
  let name = String(rawName).trim();
  const upper = name.toUpperCase();
  let title = String(rawTitle || "").trim();
  
  if (upper.includes("ALFAALILA")) { title = "Ms"; name = name.replace(/ALFAALILA/ig, ""); }
  else if (upper.includes("ALFAALIL")) { title = "Mr"; name = name.replace(/ALFAALIL/ig, ""); }
  else if (upper.includes("KOKKO")) { title = "Mstr/Miss"; name = name.replace(/KOKKO/ig, ""); }

  let age = "";
  if (rawAgeNote) {
      const noteMatch = String(rawAgeNote).match(/(\d+)\s*(Y|YR|YRS|AP|AG)/i);
      if (noteMatch) age = noteMatch[1];
      else if (String(rawAgeNote).match(/^\d+$/)) age = String(rawAgeNote);
  }

  if (name.includes(',')) {
      const parts = name.split(',').map(s => s.trim().replace(/[^a-zA-Z\s\-]/g, ""));
      const last = parts[0];
      const first = parts[1] || '';
      if (parts.length > 2 && !title) title = parts[2];
      name = `${first} ${last}`;
  } else {
      name = name.replace(/[^a-zA-Z\s\-]/g, "").replace(/\s+/g, " ").trim();
  }

  name = name.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').trim();
  let final = name;
  if (title && !final.toLowerCase().startsWith(title.toLowerCase())) final = `${title} ${final}`;
  if (age) final += ` (${age} yrs)`;

  return final;
};

const cleanNameForMatch = (n: string) => String(n || '').toLowerCase().replace(/\b(mr|ms|mrs|miss|mstr|alfaalil|alfaalila|kokko|yrs)\b/g, '').replace(/[^a-z]/g, '');

const isSameGuest = (n1: string, n2: string) => {
    if (!n1 || !n2) return false;
    const c1 = cleanNameForMatch(n1);
    const c2 = cleanNameForMatch(n2);
    if (c1.length < 4 || c2.length < 4) return false;
    return c1.includes(c2.substring(0, 8)) || c2.includes(c1.substring(0, 8));
};

const getAssociatedVillas = (villa: string) => {
    if (villa === '57') return ['56', '58'];
    if (villa === '87') return ['88'];
    return [];
};

const checkStayStatusForDate = (stayDatesStr: string, selectedDateStr: string): { isActive: boolean; isDepartingToday: boolean } => {
    if (!stayDatesStr || !stayDatesStr.includes('-')) return { isActive: false, isDepartingToday: false };
    const parts = stayDatesStr.split('-');
    if (parts.length !== 2) return { isActive: false, isDepartingToday: false };

    const arrStr = parts[0].trim();
    const depStr = parts[1].trim();

    const [selY, selM, selD] = selectedDateStr.split('-').map(Number);
    const depParts = depStr.split('/').map(Number);

    if (depParts.length >= 2) {
        const depD = depParts[0];
        const depM = depParts[1];
        const depY = depParts.length === 3 ? (depParts[2] < 100 ? 2000 + depParts[2] : depParts[2]) : selY;

        const selDateObj = new Date(selY, selM - 1, selD);
        const depDateObj = new Date(depY, depM - 1, depD);

        if (selDateObj.getTime() === depDateObj.getTime()) {
            return { isActive: true, isDepartingToday: true };
        } else if (selDateObj.getTime() < depDateObj.getTime()) {
            const arrParts = arrStr.split('/').map(Number);
            if (arrParts.length >= 2) {
                const arrD = arrParts[0];
                const arrM = arrParts[1];
                const arrY = arrParts.length === 3 ? (arrParts[2] < 100 ? 2000 + arrParts[2] : arrParts[2]) : selY;
                const arrDateObj = new Date(arrY, arrM - 1, arrD);
                if (arrDateObj.getTime() <= selDateObj.getTime()) {
                    return { isActive: true, isDepartingToday: false };
                }
                return { isActive: false, isDepartingToday: false };
            }
            return { isActive: true, isDepartingToday: false };
        }
    }
    return { isActive: false, isDepartingToday: false };
};

export type GuestProfileItem = {
    id: string;
    name: string;
    is_departed?: boolean;
};

export type GuestRecord = {
  id?: string;
  report_date: string;
  villa_number: string;
  status: string;
  guest_name: string; 
  pax_adults: number;
  pax_kids: number;
  gem_name: string;
  meal_plan: string;
  stay_dates: string; 
  remarks: string;
  preferences?: string;
  arrival_time?: string;
  departure_time?: string;
  stay_id?: string;
  incoming_guest_name?: string;
  incoming_pax_adults?: number;
  incoming_pax_kids?: number;
  incoming_arrival_time?: string;
  incoming_stay_dates?: string;
  incoming_gem_name?: string;
  incoming_meal_plan?: string;
  incoming_preferences?: string;
};

type ChangeLog = {
    villa: string;
    type: string;
    oldGuest: string;
    newGuest: string;
    oldStatus: string;
    newStatus: string;
    isMemoEdit?: boolean;
};

export default function HousekeepingSummaryPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [masterList, setMasterList] = useState<GuestRecord[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0); 
  const [lastSyncTime, setLastSyncTime] = useState<string>('');

  // Opera Filter & Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OCC' | 'ARR' | 'DEP' | 'DEP/ARR' | 'VAC'>('ALL');
  const [expandedDepVillas, setExpandedDepVillas] = useState<Record<string, boolean>>({});

  // Modals
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [changes, setChanges] = useState<ChangeLog[]>([]);
  const [pendingData, setPendingData] = useState<GuestRecord[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRollingOver, setIsRollingOver] = useState(false);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isNewRegistration, setIsNewRegistration] = useState(false);
  const [editingRecord, setEditingRecord] = useState<GuestRecord | null>(null);
  const [linkedSuitesSelection, setLinkedSuitesSelection] = useState<string[]>([]);
  const [customLinkInput, setCustomLinkInput] = useState('');
  const [parsedGuestList, setParsedGuestList] = useState<GuestProfileItem[]>([]);
  const [activeTab, setActiveTab] = useState<'details' | 'prefs' | 'departing'>('details');

  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [moveData, setMoveData] = useState({ from: '', to: '', type: 'VM/OCC', isPartial: false, mergeDest: true });

  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pastedText, setPastedText] = useState('');
  
  const [isSarongModalOpen, setIsSarongModalOpen] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState<{
      isOpen: boolean;
      title: string;
      message: string;
      confirmText?: string;
      confirmColor?: string;
      onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    const sessionData = localStorage.getItem('hk_pulse_session');
    if (sessionData) {
        try {
            const parsed = JSON.parse(sessionData);
            setIsAdmin(parsed.system_role === 'admin' || parsed.is_super_admin === true);
        } catch {
            setIsAdmin(false);
        }
    } else if (localStorage.getItem('hk_pulse_admin_auth') === 'true') {
        setIsAdmin(true);
    }

    fetchDailyData();

    const channel = supabase
        .channel('daily_summary_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_daily_summary' }, (payload) => {
            const newRec = payload.new as any;
            if (newRec && newRec.report_date === selectedDate) {
                setMasterList(prev => prev.map(v => {
                    if (normalizeVilla(v.villa_number) === normalizeVilla(newRec.villa_number)) {
                        return { ...v, ...newRec, villa_number: v.villa_number };
                    }
                    return v;
                }));
                setLastSyncTime(formatSyncDateTime(new Date()));
            }
        })
        .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedDate]);

  const toggleDepInfo = (villaNum: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setExpandedDepVillas(prev => ({ ...prev, [villaNum]: !prev[villaNum] }));
  };

  const fetchDailyData = async (showLoading = true) => {
    if (showLoading) setIsProcessing(true);
    try {
        let { data: dbRecords, error } = await supabase
          .from('hsk_daily_summary')
          .select('*')
          .eq('report_date', selectedDate);

        if (error) console.error(error);

        let isProjected = false;
        if (!dbRecords || dbRecords.length === 0) {
            const { data: recentRecords } = await supabase
              .from('hsk_daily_summary')
              .select('*')
              .lt('report_date', selectedDate)
              .order('report_date', { ascending: false })
              .limit(200);

            if (recentRecords && recentRecords.length > 0) {
                const latestDate = recentRecords[0].report_date;
                const sourceData = recentRecords.filter(r => r.report_date === latestDate);

                dbRecords = sourceData.map(r => {
                    const statusStr = String(r.status || 'VAC').trim().toUpperCase();
                    if (['OCC', 'ARR', 'DEP/ARR', 'VM/OCC', 'VM/ARR'].includes(statusStr)) {
                        const effectiveDates = statusStr === 'DEP/ARR' && r.incoming_stay_dates ? r.incoming_stay_dates : (r.stay_dates || '');
                        const check = checkStayStatusForDate(effectiveDates, selectedDate);
                        if (check.isActive) {
                            const activeName = statusStr === 'DEP/ARR' && r.incoming_guest_name ? r.incoming_guest_name : (r.guest_name || '');
                            const activeAdults = statusStr === 'DEP/ARR' && r.incoming_pax_adults ? r.incoming_pax_adults : (r.pax_adults || 0);
                            const activeKids = statusStr === 'DEP/ARR' && r.incoming_pax_kids ? r.incoming_pax_kids : (r.pax_kids || 0);
                            const activePrefs = statusStr === 'DEP/ARR' && r.incoming_preferences ? r.incoming_preferences : (r.preferences || '');

                            return {
                                ...r,
                                report_date: selectedDate,
                                status: check.isDepartingToday ? 'DEP' : (statusStr.includes('VM') ? statusStr : 'OCC'),
                                guest_name: activeName,
                                pax_adults: activeAdults,
                                pax_kids: activeKids,
                                stay_dates: effectiveDates,
                                preferences: activePrefs,
                                arrival_time: check.isDepartingToday ? '' : (r.arrival_time || ''),
                                departure_time: check.isDepartingToday ? (r.departure_time || '') : '',
                                incoming_guest_name: '',
                                incoming_arrival_time: ''
                            };
                        }
                    } else if (statusStr.includes('HOUSE') || statusStr === 'SHOW VILLA') {
                        return { ...r, report_date: selectedDate };
                    }
                    return {
                        ...r,
                        report_date: selectedDate,
                        status: 'VAC',
                        guest_name: '',
                        pax_adults: 0,
                        pax_kids: 0,
                        arrival_time: '',
                        departure_time: '',
                        stay_dates: '',
                        meal_plan: '',
                        gem_name: '',
                        preferences: '',
                        remarks: '',
                        stay_id: ''
                    };
                });
                isProjected = true;
            }
        }

        const fullList: GuestRecord[] = [];
        for (let i = 1; i <= TOTAL_VILLAS; i++) {
          const villaNum = i.toString();
          const match = dbRecords?.find(r => normalizeVilla(r.villa_number) === villaNum);
          
          if (match) {
            fullList.push({ 
                ...match, 
                villa_number: villaNum,
                guest_name: match.guest_name || '',
                status: match.status || 'VAC',
                pax_adults: match.pax_adults || 0,
                pax_kids: match.pax_kids || 0,
                gem_name: match.gem_name || '',
                meal_plan: match.meal_plan || '',
                stay_dates: match.stay_dates || '',
                arrival_time: match.arrival_time || '',
                departure_time: match.departure_time || '',
                preferences: match.preferences || '',
                remarks: match.remarks || '',
                stay_id: match.stay_id || '',
                incoming_guest_name: match.incoming_guest_name || '',
                incoming_pax_adults: match.incoming_pax_adults || 0,
                incoming_pax_kids: match.incoming_pax_kids || 0,
                incoming_arrival_time: match.incoming_arrival_time || '',
                incoming_stay_dates: match.incoming_stay_dates || '',
                incoming_gem_name: match.incoming_gem_name || '',
                incoming_meal_plan: match.incoming_meal_plan || '',
                incoming_preferences: match.incoming_preferences || ''
            });
          } else {
            fullList.push({
              report_date: selectedDate, villa_number: villaNum, status: 'VAC', guest_name: '',
              pax_adults: 0, pax_kids: 0, gem_name: '', meal_plan: '', stay_dates: '', remarks: '',
              preferences: '', arrival_time: '', departure_time: '', stay_id: ''
            });
          }
        }
        fullList.sort((a, b) => parseInt(a.villa_number, 10) - parseInt(b.villa_number, 10));
        setMasterList(fullList);

        if (dbRecords && dbRecords.length > 0 && !isProjected) {
            let maxTime = 0;
            for (const r of dbRecords) {
                const t = new Date(r.updated_at || r.created_at || 0).getTime();
                if (t > maxTime) maxTime = t;
            }
            if (maxTime > 0) {
                setLastSyncTime(formatSyncDateTime(maxTime));
            }
        } else {
            setLastSyncTime(isProjected ? `Auto-Projected • ${formatSyncDateTime(new Date())}` : '');
        }
    } catch (err) {
        console.error("fetchDailyData error:", err);
    } finally {
        if (showLoading) setIsProcessing(false);
    }
  };

  const openRegisterModal = () => {
      const firstVacant = masterList.find(r => r.status === 'VAC')?.villa_number || '1';
      setIsNewRegistration(true);
      setEditingRecord({
          report_date: selectedDate,
          villa_number: firstVacant,
          status: 'ARR',
          guest_name: '',
          pax_adults: 2,
          pax_kids: 0,
          gem_name: '',
          meal_plan: 'BB',
          stay_dates: `${selectedDate.slice(8, 10)}/${selectedDate.slice(5, 7)} - `,
          remarks: '',
          preferences: '',
          arrival_time: '',
          departure_time: '',
          stay_id: ''
      });
      setLinkedSuitesSelection(getAssociatedVillas(firstVacant));
      setCustomLinkInput('');
      setParsedGuestList([]);
      setActiveTab('details');
      setIsEditOpen(true);
  };

  const openEditModal = (row: GuestRecord) => {
      setIsNewRegistration(false);
      setEditingRecord({ ...row });
      const activeName = row.status === 'DEP/ARR' && row.incoming_guest_name ? row.incoming_guest_name : (row.guest_name || '');
      const names = activeName
          .split('&')
          .map(n => n.trim())
          .filter(Boolean)
          .map((n, idx) => ({ id: `g_${idx}_${Date.now()}`, name: n, is_departed: false }));
      setParsedGuestList(names);
      setLinkedSuitesSelection(getAssociatedVillas(row.villa_number));
      setCustomLinkInput('');
      setActiveTab('details');
      setIsEditOpen(true);
  };

  const toggleLinkedSuite = (suiteNum: string) => {
      const norm = normalizeVilla(suiteNum);
      if (!norm) return;
      setLinkedSuitesSelection(prev =>
          prev.includes(norm) ? prev.filter(s => s !== norm) : [...prev, norm]
      );
  };

  const handleAddCustomLinkVilla = () => {
      const norm = normalizeVilla(customLinkInput);
      if (!norm || parseInt(norm, 10) < 1 || parseInt(norm, 10) > TOTAL_VILLAS) {
          toast.error("Enter a valid villa number (1 - 97)");
          return;
      }
      if (editingRecord && norm === editingRecord.villa_number) {
          toast.error("Villa is already the primary room");
          return;
      }
      if (!linkedSuitesSelection.includes(norm)) {
          setLinkedSuitesSelection(prev => [...prev, norm]);
      }
      setCustomLinkInput('');
  };

  const handleSaveEdit = async () => {
    if (!editingRecord) return;
    const cleanVilla = normalizeVilla(editingRecord.villa_number);
    if (!cleanVilla || parseInt(cleanVilla, 10) < 1 || parseInt(cleanVilla, 10) > TOTAL_VILLAS) {
        toast.error("Please select a valid Villa Number (1 - 97).");
        return;
    }

    setIsProcessing(true);
    try {
        const remainingGuests = parsedGuestList.filter(g => !g.is_departed).map(g => g.name);
        let finalPayload: GuestRecord = { ...editingRecord, villa_number: cleanVilla };
        
        if (parsedGuestList.length > 0) {
            const joined = remainingGuests.join(' & ');
            if (finalPayload.status === 'DEP/ARR') {
                finalPayload.incoming_guest_name = joined;
            } else {
                finalPayload.guest_name = joined;
            }
            if (remainingGuests.length === 0 && finalPayload.status !== 'VAC') {
                finalPayload.status = 'DEP';
            }
        }

        if (!finalPayload.stay_id && finalPayload.stay_dates) {
            const arrStr = finalPayload.stay_dates.split('-')[0].trim().replace(/\//g, '');
            finalPayload.stay_id = `STAY_${finalPayload.villa_number}_${arrStr}`;
        }
        
        const masterRec = masterList.find(r => r.villa_number === finalPayload.villa_number);
        const { id: mId, ...masterPayload } = finalPayload;
        
        const { error: masterErr } = masterRec?.id 
            ? await supabase.from('hsk_daily_summary').update(masterPayload).eq('id', masterRec.id) 
            : await supabase.from('hsk_daily_summary').insert(masterPayload);

        if (masterErr) throw masterErr;

        // Sync any chosen linked villas/suites when registering or updating a guest
        for (const v of linkedSuitesSelection) {
            if (v === finalPayload.villa_number) continue;
            const targetRec = masterList.find(r => r.villa_number === v);
            const assocPayload = { 
                ...masterPayload, 
                villa_number: v,
                guest_name: '', 
                pax_adults: 0, 
                pax_kids: 0,
                arrival_time: '',
                departure_time: '',
                preferences: '',
                incoming_guest_name: '',
                incoming_pax_adults: 0,
                incoming_pax_kids: 0,
                incoming_arrival_time: '',
                incoming_stay_dates: '',
                incoming_preferences: ''
            };
            
            if (targetRec?.id) {
                await supabase.from('hsk_daily_summary').update(assocPayload).eq('id', targetRec.id);
            } else {
                await supabase.from('hsk_daily_summary').insert(assocPayload);
            }
        }
        
        setIsEditOpen(false); 
        await fetchDailyData(); 
        setEditingRecord(null);
        toast.success(isNewRegistration ? `Guest Registered in Villa ${cleanVilla}!` : "Reservation Folio Updated!");
    } catch (err: any) {
        console.error("Save edit error:", err);
        toast.error("Failed to save folio: " + (err?.message || "Unknown error"));
    } finally {
        setIsProcessing(false);
    }
  };

  const handleApproveUpdate = async () => {
      setIsProcessing(true);
      try {
          const finalPending = [...pendingData];

          // Automatically sync empty extension suites 56/58 & 88 when master suite 57 or 87 is occupied
          const v57 = finalPending.find(p => p.villa_number === '57');
          if (v57 && v57.status !== 'VAC') {
              ['56', '58'].forEach(ext => {
                  const pExt = finalPending.find(p => p.villa_number === ext);
                  if (pExt && (!pExt.guest_name || pExt.status === 'VAC')) {
                      Object.assign(pExt, {
                          status: v57.status,
                          stay_dates: v57.stay_dates,
                          stay_id: v57.stay_id,
                          meal_plan: v57.meal_plan,
                          gem_name: v57.gem_name
                      });
                  }
              });
          }

          const v87 = finalPending.find(p => p.villa_number === '87');
          if (v87 && v87.status !== 'VAC') {
              const p88 = finalPending.find(p => p.villa_number === '88');
              if (p88 && (!p88.guest_name || p88.status === 'VAC')) {
                  Object.assign(p88, {
                      status: v87.status,
                      stay_dates: v87.stay_dates,
                      stay_id: v87.stay_id,
                      meal_plan: v87.meal_plan,
                      gem_name: v87.gem_name
                  });
              }
          }

          const recordsToUpsert = finalPending.map(rec => {
              const existingRow = masterList.find(m => m.villa_number === rec.villa_number);
              return {
                  ...(existingRow?.id ? { id: existingRow.id } : {}),
                  report_date: selectedDate,
                  villa_number: rec.villa_number,
                  status: rec.status,
                  guest_name: rec.guest_name || '',
                  pax_adults: rec.pax_adults || 0,
                  pax_kids: rec.pax_kids || 0,
                  gem_name: rec.gem_name || '',
                  meal_plan: rec.meal_plan || '',
                  stay_dates: rec.stay_dates || '',
                  arrival_time: rec.arrival_time || '',
                  departure_time: rec.departure_time || '',
                  preferences: rec.preferences || '',
                  remarks: rec.remarks || '',
                  stay_id: rec.stay_id || `STAY_${rec.villa_number}_${selectedDate.replace(/-/g, '')}`,
                  incoming_guest_name: rec.incoming_guest_name || '',
                  incoming_pax_adults: rec.incoming_pax_adults || 0,
                  incoming_pax_kids: rec.incoming_pax_kids || 0,
                  incoming_arrival_time: rec.incoming_arrival_time || '',
                  incoming_stay_dates: rec.incoming_stay_dates || '',
                  incoming_gem_name: rec.incoming_gem_name || '',
                  incoming_meal_plan: rec.incoming_meal_plan || '',
                  incoming_preferences: rec.incoming_preferences || '',
                  updated_at: new Date().toISOString()
              };
          });

          const { error } = await supabase
              .from('hsk_daily_summary')
              .upsert(recordsToUpsert, { onConflict: 'report_date,villa_number' });

          if (error) throw error;

          await fetchDailyData();
          setDiffModalOpen(false);
          toast.success("Synchronized successfully!");
      } catch (err: any) {
          console.error("Approve update error:", err);
          toast.error("Sync failed: " + (err?.message || "Check network/schema"));
      } finally {
          setIsProcessing(false);
      }
  };

  const removeChange = (index: number) => {
      const changeToRemove = changes[index];
      const newChanges = [...changes];
      newChanges.splice(index, 1);
      setChanges(newChanges);

      const originalRec = masterList.find(r => r.villa_number === changeToRemove.villa);
      if (originalRec) {
          setPendingData(prev => prev.map(p => p.villa_number === changeToRemove.villa ? { ...originalRec } : p));
      }
  };

  const updatePendingRecord = (villa: string, field: keyof GuestRecord, value: string) => {
      setPendingData(prev => prev.map(p => p.villa_number === villa ? { ...p, [field]: value } : p));
  };

  const handleManualMove = async () => {
      if (!moveData.from || !moveData.to) return toast.error("Please specify both source and target villas.");
      
      const fromVillas = moveData.from.split(',').map(s => normalizeVilla(s)).filter((v): v is string => v !== null);
      const toVilla = normalizeVilla(moveData.to);
      
      if (fromVillas.length === 0 || !toVilla) return toast.error("Invalid villa number provided.");
      
      const toRec = masterList.find(r => r.villa_number === toVilla);
      if (!toRec) return toast.error("Destination villa not found.");

      setIsProcessing(true);
      try {
          let combinedNames: string[] = moveData.mergeDest && toRec.guest_name ? [toRec.guest_name] : [];
          let combinedAdults: number = moveData.mergeDest ? (toRec.pax_adults || 0) : 0;
          let combinedKids: number = moveData.mergeDest ? (toRec.pax_kids || 0) : 0;
          let combinedPrefs: string[] = moveData.mergeDest && toRec.preferences ? [toRec.preferences] : [];
          let mealPlan: string = moveData.mergeDest && toRec.meal_plan ? toRec.meal_plan : '';
          let gemName: string = moveData.mergeDest && toRec.gem_name ? toRec.gem_name : '';
          let stayDates: string = moveData.mergeDest && toRec.stay_dates ? toRec.stay_dates : '';
          let stayId: string = toRec.stay_id || '';

          for (const v of fromVillas) {
              const fromRec = masterList.find(r => r.villa_number === v);
              if (fromRec) {
                  if (fromRec.guest_name) combinedNames.push(fromRec.guest_name);
                  combinedAdults += (fromRec.pax_adults || 0);
                  combinedKids += (fromRec.pax_kids || 0);
                  if (fromRec.preferences) combinedPrefs.push(fromRec.preferences);
                  if (!mealPlan && fromRec.meal_plan) mealPlan = fromRec.meal_plan;
                  if (!gemName && fromRec.gem_name) gemName = fromRec.gem_name;
                  if (!stayDates && fromRec.stay_dates) stayDates = fromRec.stay_dates;
                  if (!stayId && fromRec.stay_id) stayId = fromRec.stay_id;
              }
          }

          const upsertBatch: any[] = [];

          const toPayload = {
              ...(toRec.id ? { id: toRec.id } : {}),
              report_date: selectedDate,
              villa_number: toVilla,
              status: moveData.type,
              guest_name: combinedNames.join(' & '),
              pax_adults: combinedAdults,
              pax_kids: combinedKids,
              preferences: combinedPrefs.join('\n\n'),
              meal_plan: mealPlan,
              gem_name: gemName,
              stay_dates: stayDates,
              stay_id: stayId || `STAY_VM_${toVilla}_${selectedDate.replace(/-/g, '')}`,
              updated_at: new Date().toISOString()
          };
          upsertBatch.push(toPayload);

          if (!moveData.isPartial) {
              for (const v of fromVillas) {
                  const sRec = masterList.find(r => r.villa_number === v);
                  if (sRec) {
                      upsertBatch.push({
                          ...(sRec.id ? { id: sRec.id } : {}),
                          report_date: selectedDate,
                          villa_number: v,
                          status: 'VM/VAC',
                          guest_name: '',
                          pax_adults: 0,
                          pax_kids: 0,
                          meal_plan: '',
                          stay_dates: '',
                          preferences: '',
                          gem_name: '',
                          stay_id: '',
                          updated_at: new Date().toISOString()
                      });
                  }
              }
          }

          const { error } = await supabase.from('hsk_daily_summary').upsert(upsertBatch, { onConflict: 'report_date,villa_number' });
          if (error) throw error;

          setIsMoveModalOpen(false);
          setMoveData({ from: '', to: '', type: 'VM/OCC', isPartial: false, mergeDest: true });
          await fetchDailyData();
          toast.success(`Successfully moved guest party to Villa ${toVilla}`);
      } catch (err: any) {
          console.error("Move error:", err);
          toast.error("Villa Move failed: " + (err?.message || "Unknown error"));
      } finally {
          setIsProcessing(false);
      }
  };

  const handlePasteSubmit = () => {
      if (!pastedText.trim()) {
          toast.error("Please paste Excel memo data first.");
          return;
      }
      setIsProcessing(true);
      setIsPasteModalOpen(false);
      
      const rows = pastedText.split('\n').map(row => row.split('\t'));
      processOperationalMemo(rows);
      setPastedText(''); 
  };

  const handleFileProcess = (e: React.ChangeEvent<HTMLInputElement>, type: 'ARRDEP_XML' | 'OCC' | 'MEMO_CSV') => {
      const file = e.target.files?.[0];
      if (!file) return;
      setIsProcessing(true);

      const reader = new FileReader();
      reader.onload = (evt) => {
          try {
              const data = evt.target?.result as string;
              if (type === 'OCC') {
                  processOCCXML(data);
              } else if (type === 'ARRDEP_XML') {
                  processArrDepXML(data);
              } else if (type === 'MEMO_CSV') {
                  processDailyMemoCSV(data);
              }
          } catch (err) {
              toast.error("Error parsing file. Please verify export format.");
              setIsProcessing(false);
          }
          e.target.value = '';
          setFileInputKey(prev => prev + 1);
      };

      reader.readAsText(file);
  };

  // OCC XML PARSER: Preserves preferences & NEVER flags 56, 58, 88 as missing
  const processOCCXML = (xmlText: string) => {
      try {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(xmlText, "text/xml");
          const nodes = Array.from(xmlDoc.querySelectorAll('G_C9'));
          
          const currentMap = new Map(masterList.map(r => [r.villa_number, { ...r }]));
          const diffs: ChangeLog[] = [];
          const resByVilla: Record<string, any[]> = {};
          
          nodes.forEach((node: any) => {
              const v = node.querySelector('C9')?.textContent?.trim();
              if (v) {
                  if (!resByVilla[v]) resByVilla[v] = [];
                  resByVilla[v].push(node);
              }
          });

          const newOccList: any[] = [];

          for (const [villa, resList] of Object.entries(resByVilla)) {
              const cleanVilla = normalizeVilla(villa);
              if (!cleanVilla || !currentMap.has(cleanVilla)) continue;
              
              let totalAdults = 0; let totalKids = 0;
              let names: string[] = []; let mealPlan = 'RO'; let gemName = '';
              let arrDate = ''; let depDate = '';

              resList.forEach(res => {
                  const rawName = res.querySelector('C36')?.textContent || '';
                  const title = res.querySelector('C33')?.textContent || '';
                  if (rawName) names.push(formatGuestName(rawName, title));
                  
                  totalAdults += parseInt(res.querySelector('C48')?.textContent || '0', 10);
                  totalKids += parseInt(res.querySelector('C51')?.textContent || '0', 10);
                  
                  const mPlan = res.querySelector('C30')?.textContent?.trim();
                  if (mPlan && mPlan !== 'RO') mealPlan = mPlan;
                  
                  const gem = res.querySelector('C27')?.textContent?.trim();
                  if (gem) gemName = gem;

                  if (!arrDate) arrDate = res.querySelector('C81')?.textContent || '';
                  if (!depDate) depDate = res.querySelector('C87')?.textContent || '';
              });

              let stayDates = ''; let stayId = '';
              if (arrDate && depDate) {
                  const aParts = arrDate.split('-'); const dParts = depDate.split('-');
                  if (aParts.length === 3 && dParts.length === 3) {
                      const aMonth = monthToNum(aParts[1]);
                      const dMonth = monthToNum(dParts[1]);
                      stayDates = `${aParts[0].padStart(2, '0')}/${aMonth} - ${dParts[0].padStart(2, '0')}/${dMonth}`;
                      stayId = `STAY_${cleanVilla}_${aParts[2]}${aMonth}${aParts[0].padStart(2, '0')}`; 
                  }
              }

              newOccList.push({
                  villa: cleanVilla,
                  names: names.join(' & '),
                  adults: totalAdults,
                  kids: totalKids,
                  mealPlan: mealPlan,
                  gemName: gemName,
                  stayDates: stayDates,
                  stayId: stayId
              });
          }

          newOccList.forEach(newOcc => {
              const record = currentMap.get(newOcc.villa)!;
              let oldVillaMatch: GuestRecord | null = null;

              if (!isSameGuest(record.guest_name, newOcc.names)) {
                  for (const [vNum, rec] of currentMap.entries()) {
                      if (vNum !== newOcc.villa && ['OCC', 'ARR', 'DEP/ARR', 'VM/OCC', 'VM/ARR'].includes(rec.status)) {
                          if (isSameGuest(rec.guest_name, newOcc.names)) {
                              oldVillaMatch = rec;
                              break;
                          }
                      }
                  }
              }

              const oldStatus = record.status || 'VAC';
              if (!String(oldStatus).includes('ARR') && !String(oldStatus).includes('DEP')) record.status = 'OCC';
              
              const existingPrefs = record.preferences || '';

              record.guest_name = newOcc.names;
              record.pax_adults = newOcc.adults;
              record.pax_kids = newOcc.kids;
              record.meal_plan = newOcc.mealPlan;
              record.stay_dates = newOcc.stayDates;
              record.stay_id = newOcc.stayId;

              if (oldVillaMatch) {
                  if (!newOcc.gemName && oldVillaMatch.gem_name) record.gem_name = oldVillaMatch.gem_name;
                  else record.gem_name = newOcc.gemName;
                  
                  if (oldVillaMatch.arrival_time) record.arrival_time = oldVillaMatch.arrival_time;
                  if (oldVillaMatch.departure_time) record.departure_time = oldVillaMatch.departure_time;
                  record.preferences = existingPrefs || oldVillaMatch.preferences || '';

                  diffs.push({
                      villa: newOcc.villa, type: 'ALLOC CHANGE',
                      oldGuest: oldStatus === 'VAC' ? 'Vacant' : record.guest_name,
                      newGuest: `${newOcc.names} (Moved from V${oldVillaMatch.villa_number})`,
                      oldStatus: oldStatus, newStatus: record.status
                  });
              } else {
                  record.gem_name = newOcc.gemName;
                  record.preferences = existingPrefs;

                  diffs.push({
                      villa: newOcc.villa, type: 'SYNC',
                      oldGuest: oldStatus === 'VAC' ? 'Vacant' : record.guest_name,
                      newGuest: record.guest_name, oldStatus: oldStatus, newStatus: record.status
                  });
              }
          });

          // Discrepancy checks: Exclude 56, 58, 88
          currentMap.forEach((rec, vNum) => {
              if (EXTENSION_VILLAS.includes(vNum)) return;

              const inOCC = newOccList.find(n => n.villa === vNum);
              const isTMA = String(rec?.status || '').toUpperCase().includes('TMA');
              const guestUpper = String(rec?.guest_name || '').toUpperCase();
              const isHouseUse = guestUpper.includes('HOUSE USE') || guestUpper.includes('H/U') || String(rec?.status || '').toUpperCase().includes('HOUSE');

              if (!inOCC && ['OCC', 'ARR', 'DEP/ARR', 'VM/OCC', 'VM/ARR'].includes(rec.status)) {
                  if (!isTMA && !isHouseUse) {
                      const movedTo = newOccList.find(n => isSameGuest(n.names, rec.guest_name));
                      
                      if (movedTo) {
                          diffs.push({
                              villa: vNum, type: 'MOVED OUT',
                              oldGuest: rec.guest_name,
                              newGuest: `Moved to V${movedTo.villa}`,
                              oldStatus: rec.status, newStatus: 'VAC'
                          });
                      } else {
                          diffs.push({
                              villa: vNum, type: 'DISCREPANCY',
                              oldGuest: rec.guest_name || 'Expected Guest',
                              newGuest: 'Not in OCC List (Checked out / No Show)',
                              oldStatus: rec.status, newStatus: 'VAC'
                          });
                      }
                      
                      rec.status = 'VAC'; rec.guest_name = ''; rec.pax_adults = 0; rec.pax_kids = 0;
                      rec.meal_plan = ''; rec.stay_dates = ''; rec.gem_name = ''; rec.stay_id = '';
                  }
              }
          });

          setChanges(diffs);
          setPendingData(Array.from(currentMap.values()));
          setDiffModalOpen(true);
      } catch (err: any) {
          console.error("processOCCXML error:", err);
          toast.error("Failed to parse OCC XML: " + (err?.message || "Unknown error"));
      } finally {
          setIsProcessing(false);
      }
  };

  const processArrDepXML = (xmlText: string) => {
      try {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(xmlText, "text/xml");
          
          const reservations = Array.from(xmlDoc.querySelectorAll('G_RESERVATION'));
          const currentMap = new Map(masterList.map(r => [r.villa_number, { ...r }]));
          const diffs: ChangeLog[] = [];
          const resByVilla: Record<string, any[]> = {};
          
          const getText = (node: Element, tag: string) => {
              let el = node.querySelector(tag) || node.querySelector(tag.toLowerCase());
              return el ? el.textContent?.trim() || '' : '';
          };

          reservations.forEach((res: any) => {
              const v = getText(res, 'DISP_ROOM_NO');
              if (v) {
                  if (!resByVilla[v]) resByVilla[v] = [];
                  resByVilla[v].push(res);
              }
          });

          const newArrList: any[] = [];

          for (const [villa, resList] of Object.entries(resByVilla)) {
              const cleanVilla = normalizeVilla(villa);
              if (!cleanVilla || !currentMap.has(cleanVilla)) continue;

              let isArr = false; let isDep = false;
              let isFullyDeparting = true;
              let arrNames: string[] = []; let depNames: string[] = [];
              let isExtFromCarrier = false;

              resList.forEach(res => {
                  const arrDate = getText(res, 'ARRIVAL');
                  const depDate = getText(res, 'DEPARTURE');
                  const arrCarrier = (getText(res, 'ARRIVAL_CARRIER_CODE') || '').toUpperCase();
                  
                  if (arrCarrier.includes('EXT') || arrCarrier.includes('STAY EXT')) {
                      isExtFromCarrier = true;
                  }

                  if (arrDate && depDate) {
                      const aFull = `20${arrDate.split('-')[2]}-${monthToNum(arrDate.split('-')[1])}-${arrDate.split('-')[0].padStart(2, '0')}`;
                      const dFull = `20${depDate.split('-')[2]}-${monthToNum(depDate.split('-')[1])}-${depDate.split('-')[0].padStart(2, '0')}`;
                      
                      const rawName = getText(res, 'FULL_NAME_NO_SHR_IND') || getText(res, 'FULL_NAME') || '';
                      const formattedName = formatGuestName(rawName);

                      if (aFull === selectedDate) { isArr = true; arrNames.push(formattedName); }
                      if (dFull === selectedDate) { isDep = true; depNames.push(formattedName); }
                      
                      if (dFull > selectedDate) {
                          isFullyDeparting = false;
                      }
                  }
              });

              let isB2BExtension = isExtFromCarrier;
              if (isArr && isDep) {
                  if (arrNames.some(aName => depNames.some(dName => isSameGuest(aName, dName)))) {
                      isB2BExtension = true;
                  }
              }

              let finalStatus = 'OCC';
              if (isArr && isDep && !isB2BExtension) finalStatus = 'DEP/ARR';
              else if (isArr) finalStatus = 'ARR';
              else if (isDep) finalStatus = isFullyDeparting ? 'DEP' : 'OCC';
              else if (resList.every(r => getText(r, 'SHORT_RESV_STATUS').includes('CKOT'))) finalStatus = 'VAC';

              let primaryResList = resList;
              if (finalStatus === 'DEP/ARR' || isB2BExtension) {
                  primaryResList = resList.filter(res => {
                      const arrDate = getText(res, 'ARRIVAL');
                      if (!arrDate) return false;
                      const aFull = `20${arrDate.split('-')[2]}-${monthToNum(arrDate.split('-')[1])}-${arrDate.split('-')[0].padStart(2, '0')}`;
                      return aFull === selectedDate;
                  });
              }

              let totalAdults = 0; let totalKids = 0;
              let names: string[] = []; let prefs: string[] = [];
              let mealPlan = ''; let stayDates = ''; let stayId = '';

              primaryResList.forEach(res => {
                  const rawName = getText(res, 'FULL_NAME_NO_SHR_IND') || getText(res, 'FULL_NAME') || '';
                  if (rawName) names.push(formatGuestName(rawName));
                  
                  totalAdults += parseInt(getText(res, 'ADULTS') || '0', 10);
                  totalKids += parseInt(getText(res, 'CHILDREN') || '0', 10);

                  const arrDate = getText(res, 'ARRIVAL');
                  const depDate = getText(res, 'DEPARTURE');
                  if (arrDate && depDate) {
                      const aParts = arrDate.split('-'); const dParts = depDate.split('-');
                      if (aParts.length === 3 && dParts.length === 3) {
                          const aMonth = monthToNum(aParts[1]);
                          const dMonth = monthToNum(dParts[1]);
                          stayDates = `${aParts[0].padStart(2, '0')}/${aMonth} - ${dParts[0].padStart(2, '0')}/${dMonth}`;
                          stayId = `STAY_${cleanVilla}_${aParts[2]}${aMonth}${aParts[0].padStart(2, '0')}`; 
                      }
                  }

                  const comments = Array.from(res.querySelectorAll('RES_COMMENT'));
                  comments.forEach((c: any) => { if (c.textContent) prefs.push(c.textContent.trim().replace(/\s+/g, ' ')); });
              });

              newArrList.push({
                  villa: cleanVilla,
                  names: names.join(' & '),
                  adults: totalAdults,
                  kids: totalKids,
                  mealPlan: mealPlan,
                  stayDates: stayDates,
                  stayId: stayId,
                  status: finalStatus,
                  isB2B: isB2BExtension,
                  prefs: Array.from(new Set(prefs)).join('\n\n')
              });
          }

          newArrList.forEach(newArr => {
              const record = currentMap.get(newArr.villa)!;
              const oldStatus = record.status || 'VAC';
              let newStatus = newArr.status;

              if (newStatus === 'DEP/ARR' || (String(oldStatus).includes('DEP') && String(newStatus).includes('ARR'))) {
                  record.status = 'DEP/ARR';
                  record.incoming_guest_name = newArr.names;
                  record.incoming_pax_adults = newArr.adults;
                  record.incoming_pax_kids = newArr.kids;
                  record.incoming_stay_dates = newArr.stayDates;
                  record.incoming_preferences = newArr.prefs;

                  diffs.push({
                      villa: newArr.villa,
                      type: 'DEP/ARR DUAL',
                      oldGuest: record.guest_name ? `Dep: ${record.guest_name}` : 'Departing Guest',
                      newGuest: `Arr: ${newArr.names}`,
                      oldStatus: oldStatus,
                      newStatus: 'DEP/ARR'
                  });
                  return;
              }

              record.status = newStatus;
              record.guest_name = newArr.names;
              record.pax_adults = newArr.adults;
              record.pax_kids = newArr.kids;
              record.stay_dates = newArr.stayDates;
              record.stay_id = newArr.stayId;
              if (newArr.prefs) {
                  record.preferences = record.preferences ? `${record.preferences}\n\n${newArr.prefs}` : newArr.prefs;
              }

              diffs.push({
                  villa: newArr.villa,
                  type: newStatus === 'ARR' ? 'ARRIVAL' : 'SYNC',
                  oldGuest: oldStatus === 'VAC' ? 'Vacant' : record.guest_name,
                  newGuest: newArr.names,
                  oldStatus: oldStatus,
                  newStatus: newStatus
              });
          });

          setChanges(diffs);
          setPendingData(Array.from(currentMap.values()));
          setDiffModalOpen(true);
      } catch (err: any) {
          console.error("processArrDepXML error:", err);
          toast.error("Failed to parse Arrivals XML: " + (err?.message || "Unknown error"));
      } finally {
          setIsProcessing(false);
      }
  };

  // PARSE FULL DAILY MEMO (CSV / TEXT)
  const processDailyMemoCSV = (csvText: string) => {
      try {
          const lines = csvText.split(/\r?\n/).map(l => l.split(','));
          const currentMap = new Map(masterList.map(r => [r.villa_number, { ...r }]));
          const diffs: ChangeLog[] = [];

          let section: 'ARRIVALS' | 'DEPARTURES' | 'MOVES' | 'NONE' = 'NONE';
          let headerRowIndex = -1;

          for (let i = 0; i < lines.length; i++) {
              const row = lines[i];
              const lineText = row.join(' ').toUpperCase();

              if (lineText.includes('ARRIVALS') && !lineText.includes('ATTENDEES')) {
                  section = 'ARRIVALS';
                  headerRowIndex = i + 1;
                  continue;
              } else if (lineText.includes('DEPARTURES')) {
                  section = 'DEPARTURES';
                  headerRowIndex = i + 1;
                  continue;
              } else if (lineText.includes('ROOM MOVES')) {
                  section = 'MOVES';
                  headerRowIndex = i + 1;
                  continue;
              }

              if (section === 'ARRIVALS' && row.length > 5 && i > headerRowIndex) {
                  const vNum = normalizeVilla(row[1]) || normalizeVilla(row[0]);
                  if (vNum && currentMap.has(vNum)) {
                      const record = currentMap.get(vNum)!;
                      const rawName = row[7] || row[8] || '';
                      const guestName = formatGuestName(rawName);
                      const gem = (row[9] || row[10] || '').trim();
                      const special = (row[11] || row[12] || '').trim();
                      const depDateStr = (row[5] || row[6] || '').trim();
                      const arrTime = extractTime(row[3] || row[4] || '');

                      if (guestName) {
                          if (record.status.includes('DEP')) {
                              record.status = 'DEP/ARR';
                              record.incoming_guest_name = guestName;
                              if (arrTime) record.incoming_arrival_time = arrTime;
                              if (gem) record.incoming_gem_name = gem;
                              if (special) record.incoming_preferences = special;
                          } else {
                              record.guest_name = guestName;
                              record.status = 'ARR';
                              if (arrTime) record.arrival_time = arrTime;
                              if (gem) record.gem_name = gem;
                              if (depDateStr) record.stay_dates = `${selectedDate.substring(5)} - ${depDateStr.replace(/\n/g, ' ')}`;
                              if (special) record.preferences = record.preferences ? `${record.preferences}\n\n${special}` : special;
                          }

                          diffs.push({
                              villa: vNum,
                              type: 'MEMO ARRIVAL',
                              oldGuest: 'Vacant / Old',
                              newGuest: guestName,
                              oldStatus: 'VAC',
                              newStatus: record.status
                          });
                      }
                  }
              } else if (section === 'DEPARTURES' && row.length > 5 && i > headerRowIndex) {
                  const vNum = normalizeVilla(row[0]) || normalizeVilla(row[1]);
                  if (vNum && currentMap.has(vNum)) {
                      const record = currentMap.get(vNum)!;
                      const depTime = extractTime(row[3] || row[2] || '');
                      if (depTime) record.departure_time = depTime;
                      record.status = record.status.includes('ARR') ? 'DEP/ARR' : 'DEP';

                      diffs.push({
                          villa: vNum,
                          type: 'MEMO DEPARTURE',
                          oldGuest: record.guest_name,
                          newGuest: `Dep at ${depTime}`,
                          oldStatus: record.status,
                          newStatus: record.status
                      });
                  }
              } else if (section === 'MOVES' && row.length >= 2 && i > headerRowIndex) {
                  const fromV = normalizeVilla(row[0]);
                  const toV = normalizeVilla(row[1]);
                  if (fromV && toV && currentMap.has(fromV) && currentMap.has(toV)) {
                      const sRec = currentMap.get(fromV)!;
                      const dRec = currentMap.get(toV)!;

                      dRec.status = 'VM/OCC';
                      dRec.guest_name = sRec.guest_name;
                      dRec.pax_adults = sRec.pax_adults;
                      dRec.pax_kids = sRec.pax_kids;
                      dRec.preferences = sRec.preferences;
                      dRec.meal_plan = sRec.meal_plan;
                      dRec.gem_name = sRec.gem_name;
                      dRec.stay_dates = sRec.stay_dates;

                      sRec.status = 'VM/VAC';
                      sRec.guest_name = '';

                      diffs.push({
                          villa: toV,
                          type: 'ROOM MOVE',
                          oldGuest: 'Vacant',
                          newGuest: `${dRec.guest_name} (From V${fromV})`,
                          oldStatus: 'VAC',
                          newStatus: 'VM/OCC'
                      });
                  }
              }
          }

          if (diffs.length === 0) {
              toast.error("No arrivals, departures, or room moves found in memo.");
              return;
          }

          setChanges(diffs);
          setPendingData(Array.from(currentMap.values()));
          setDiffModalOpen(true);
      } catch (err: any) {
          console.error("processDailyMemoCSV error:", err);
          toast.error("Failed to parse Daily Memo: " + err.message);
      } finally {
          setIsProcessing(false);
      }
  };

  const processOperationalMemo = (rows: any[][]) => {
      try {
          const currentMap = new Map(masterList.map(r => [r.villa_number, { ...r }]));
          const diffs: ChangeLog[] = [];

          let isArrSection = false, isDepSection = false;
          
          for (let i = 0; i < rows.length; i++) {
              const row = rows[i] || [];
              if (row.length < 2) continue;
              const rowStr = row.map(c => String(c || '').toUpperCase()).join(' ');

              if (rowStr.includes('ARRIVALS') && !rowStr.includes('VS')) { isArrSection = true; isDepSection = false; continue; }
              if (rowStr.includes('DEPARTURES')) { isArrSection = false; isDepSection = true; continue; }
              if (rowStr.includes('ROOM MOVES')) break; 

              if (isArrSection) {
                  let v = normalizeVilla(row[1]) || normalizeVilla(row[0]); 
                  if (v && currentMap.has(v)) {
                      const record = currentMap.get(v)!;
                      const gemName = row[9] ? String(row[9]).split('\n')[0] : null; 
                      const arrTimeRaw = String(row[4] || '') + " " + String(row[5] || '') + " " + String(row[3] || ''); 

                      let isTMA = rowStr.includes('8Q') || rowStr.includes('TMA') || rowStr.includes('SHUT');
                      let madeChange = false;

                      if (isTMA && !String(record?.status || '').includes('TMA')) {
                          record.status = 'TMA (Day)';
                          madeChange = true;
                      }
                      if (gemName && gemName.length > 1 && !gemName.includes(',')) {
                          record.gem_name = gemName.trim();
                          madeChange = true;
                      }
                      const t = extractTime(arrTimeRaw);
                      if (t) {
                          if (record.status === 'DEP/ARR' && record.incoming_arrival_time !== t) {
                              record.incoming_arrival_time = t;
                              madeChange = true;
                          } else if (record.arrival_time !== t) {
                              record.arrival_time = t;
                              madeChange = true;
                          }
                      }

                      if (madeChange) {
                          diffs.push({ villa: v, type: 'INFO SYNC', isMemoEdit: true, oldGuest: record.guest_name, newGuest: record.guest_name, oldStatus: record.status, newStatus: record.status });
                      }
                  }
              }

              if (isDepSection) {
                  let v = normalizeVilla(row[1]) || normalizeVilla(row[0]);
                  if (v && currentMap.has(v)) {
                      const record = currentMap.get(v)!;
                      const gemName = row[10] ? String(row[10]).split('\n')[0] : null; 
                      const depTimeRaw = String(row[4] || '') + " " + String(row[5] || '') + " " + String(row[7] || ''); 

                      let madeChange = false;
                      const t = extractTime(depTimeRaw);
                      if (t && record.departure_time !== t) {
                          record.departure_time = t;
                          madeChange = true;
                      }
                      if (gemName && gemName.length > 1 && !gemName.includes(',') && !record.gem_name) {
                          record.gem_name = gemName.trim();
                          madeChange = true;
                      }

                      if (madeChange) {
                          diffs.push({ villa: v, type: 'INFO SYNC', isMemoEdit: true, oldGuest: record.guest_name, newGuest: record.guest_name, oldStatus: record.status, newStatus: record.status });
                      }
                  }
              }
          }

          if (diffs.length === 0) {
              toast.success("No new operational times found in memo.");
              return;
          }

          setChanges(diffs);
          setPendingData(Array.from(currentMap.values()));
          setDiffModalOpen(true);
      } catch (err: any) {
          console.error("processOperationalMemo error:", err);
          toast.error("Failed to parse memo: " + (err?.message || "Unknown error"));
      } finally {
          setIsProcessing(false);
      }
  };

  const handleRollOver = () => {
      setConfirmDialog({
          isOpen: true,
          title: "Confirm Rollover",
          message: `Bring forward all active guests into ${selectedDate}?`,
          confirmText: "Yes, Roll Over",
          confirmColor: "bg-[#6D2158] hover:bg-[#5a1b49]",
          onConfirm: async () => {
              setConfirmDialog(null);
              setIsRollingOver(true);
              try {
                  const { data: recentRecords, error: fetchErr } = await supabase
                      .from('hsk_daily_summary')
                      .select('*')
                      .lt('report_date', selectedDate)
                      .order('report_date', { ascending: false })
                      .limit(250);

                  if (fetchErr) throw fetchErr;

                  if (!recentRecords || recentRecords.length === 0) { 
                      toast.error("No previous day records found to roll over."); 
                      return; 
                  }

                  const lastDate = recentRecords[0].report_date;
                  const sourceData = recentRecords.filter(r => r.report_date === lastDate);
                  
                  const batchPayload = [];

                  for (let i = 1; i <= TOTAL_VILLAS; i++) {
                      const vNum = i.toString();
                      const prevRec = sourceData.find(r => normalizeVilla(r.villa_number) === vNum);
                      const existingRow = masterList.find(m => m.villa_number === vNum);

                      let newStatus = 'VAC';
                      let keepDetails = false;
                      let carryName = '';
                      let carryAdults = 0;
                      let carryKids = 0;
                      let carryGem = '';
                      let carryMeal = '';
                      let carryDates = '';
                      let carryPrefs = '';
                      let carryStayId = '';

                      if (prevRec) {
                          const statusStr = String(prevRec.status || 'VAC').trim().toUpperCase();

                          if (['OCC', 'ARR', 'DEP/ARR', 'VM/OCC', 'VM/ARR'].includes(statusStr)) {
                              const effectiveDates = statusStr === 'DEP/ARR' && prevRec.incoming_stay_dates ? prevRec.incoming_stay_dates : (prevRec.stay_dates || '');
                              const check = checkStayStatusForDate(effectiveDates, selectedDate);
                              if (check.isActive) {
                                  newStatus = check.isDepartingToday ? 'DEP' : (statusStr.includes('VM') ? statusStr : 'OCC');
                                  keepDetails = true;
                                  carryName = statusStr === 'DEP/ARR' && prevRec.incoming_guest_name ? prevRec.incoming_guest_name : (prevRec.guest_name || '');
                                  carryAdults = statusStr === 'DEP/ARR' && prevRec.incoming_pax_adults ? prevRec.incoming_pax_adults : (prevRec.pax_adults || 0);
                                  carryKids = statusStr === 'DEP/ARR' && prevRec.incoming_pax_kids ? prevRec.incoming_pax_kids : (prevRec.pax_kids || 0);
                                  carryGem = statusStr === 'DEP/ARR' && prevRec.incoming_gem_name ? prevRec.incoming_gem_name : (prevRec.gem_name || '');
                                  carryMeal = statusStr === 'DEP/ARR' && prevRec.incoming_meal_plan ? prevRec.incoming_meal_plan : (prevRec.meal_plan || '');
                                  carryDates = effectiveDates;
                                  carryPrefs = statusStr === 'DEP/ARR' && prevRec.incoming_preferences ? prevRec.incoming_preferences : (prevRec.preferences || '');
                                  carryStayId = prevRec.stay_id || '';
                              }
                          } else if (['DEP', 'DAY USE', 'VM/VAC'].includes(statusStr) || statusStr.includes('TMA')) {
                              newStatus = 'VAC';
                              keepDetails = false;
                          } else if (statusStr.includes('HOUSE') || statusStr === 'SHOW VILLA') {
                              newStatus = prevRec.status;
                              keepDetails = true;
                              carryName = prevRec.guest_name || '';
                              carryAdults = prevRec.pax_adults || 0;
                              carryKids = prevRec.pax_kids || 0;
                              carryGem = prevRec.gem_name || '';
                              carryMeal = prevRec.meal_plan || '';
                              carryDates = prevRec.stay_dates || '';
                              carryPrefs = prevRec.preferences || '';
                              carryStayId = prevRec.stay_id || '';
                          }
                      }

                      batchPayload.push({
                          ...(existingRow?.id ? { id: existingRow.id } : {}),
                          report_date: selectedDate,
                          villa_number: vNum,
                          status: newStatus,
                          guest_name: keepDetails ? carryName : '',
                          pax_adults: keepDetails ? carryAdults : 0,
                          pax_kids: keepDetails ? carryKids : 0,
                          gem_name: keepDetails ? carryGem : '',
                          meal_plan: keepDetails ? carryMeal : '',
                          stay_dates: keepDetails ? carryDates : '',
                          remarks: '',
                          preferences: keepDetails ? carryPrefs : '',
                          arrival_time: '',
                          departure_time: '',
                          stay_id: keepDetails ? carryStayId : '',
                          updated_at: new Date().toISOString()
                      });
                  }

                  const { error: upsertErr } = await supabase
                      .from('hsk_daily_summary')
                      .upsert(batchPayload, { onConflict: 'report_date,villa_number' });

                  if (upsertErr) throw upsertErr;

                  await fetchDailyData();
                  toast.success("Rollover completed instantly!");
              } catch (err: any) {
                  console.error("Rollover failed:", err);
                  toast.error("Rollover failed: " + (err?.message || "Check network/schema"));
              } finally {
                  setIsRollingOver(false);
              }
          }
      });
  };

  const changeDate = (days: number) => {
      const [year, month, day] = selectedDate.split('-').map(Number);
      const d = new Date(year, month - 1, day + days);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dy = String(d.getDate()).padStart(2, '0');
      setSelectedDate(`${y}-${m}-${dy}`);
  };

  const getSarongCounts = () => {
      let counts = {
          jettyA: { villas: 0, male: 0, female: 0, kids: 0 },
          jettyB: { villas: 0, male: 0, female: 0, kids: 0 },
          jettyC: { villas: 0, male: 0, female: 0, kids: 0 },
          beach:  { villas: 0, male: 0, female: 0, kids: 0 },
          total:  { villas: 0, male: 0, female: 0, kids: 0 }
      };

      masterList.forEach(rec => {
          const st = String(rec?.status || 'VAC').toUpperCase();
          if (st === 'VAC' || (st.includes('DEP') && !st.includes('ARR'))) return;
          if (st === 'VM/VAC') return;
          if (st.includes('TMA')) return;
          
          const activeName = st === 'DEP/ARR' && rec.incoming_guest_name ? rec.incoming_guest_name : (rec?.guest_name || '');
          const gUpper = String(activeName).toUpperCase();
          if (gUpper && (gUpper.includes('HOUSE USE') || gUpper.includes('H/U') || st === 'HOUSE USE')) return;

          const v = parseInt(rec.villa_number, 10);
          if (isNaN(v)) return;

          let area: 'jettyA' | 'jettyB' | 'jettyC' | 'beach' = 'beach';
          if (v >= 1 && v <= 35) area = 'jettyA';
          else if (v >= 37 && v <= 50) area = 'jettyB';
          else if (v >= 59 && v <= 79) area = 'jettyC';

          let adults = st === 'DEP/ARR' && rec.incoming_pax_adults ? rec.incoming_pax_adults : (rec.pax_adults || 0);
          let kids = st === 'DEP/ARR' && rec.incoming_pax_kids ? rec.incoming_pax_kids : (rec.pax_kids || 0);

          let male = 0;
          let female = 0;

          const mrCount = (gUpper.match(/\bMR\b/g) || []).length;
          const msCount = (gUpper.match(/\b(MS|MRS|MISS|ALFAALILA)\b/g) || []).length;
          
          male += mrCount;
          female += msCount;

          let remaining = adults - (male + female);
          if (remaining > 0) {
              if (male === 0 && female === 0 && remaining === 2) {
                  male += 1; female += 1;
              } else if (male > female) {
                  female += remaining;
              } else {
                  male += remaining;
              }
          } else if (remaining < 0) {
              if (male + female > adults && adults > 0) {
                  male = Math.ceil(adults / 2);
                  female = Math.floor(adults / 2);
              }
          }

          counts[area].villas += 1;
          counts[area].male += male;
          counts[area].female += female;
          counts[area].kids += kids;

          counts.total.villas += 1;
          counts.total.male += male;
          counts.total.female += female;
          counts.total.kids += kids;
      });

      return counts;
  };

  const renderSarongArea = (title: string, data: any) => (
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col gap-2">
          <div className="flex justify-between items-center mb-1">
              <h4 className="font-bold text-sm text-slate-800">{title}</h4>
              <span className="text-[10px] font-bold bg-white px-2 py-1 rounded-md text-slate-500 border border-slate-200">{data.villas} Villas</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
              <div className="bg-white p-2 rounded-lg border border-slate-200 flex flex-col items-center justify-center">
                  <span className="text-xl">⬛</span>
                  <span className="text-[10px] font-bold text-slate-500 mt-1">Black (Male)</span>
                  <span className="text-lg font-black text-slate-800">{data.male}</span>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200 flex flex-col items-center justify-center">
                  <span className="text-xl">🟥</span>
                  <span className="text-[10px] font-bold text-slate-500 mt-1">Maroon (Fem)</span>
                  <span className="text-lg font-black text-slate-800">{data.female}</span>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200 flex flex-col items-center justify-center">
                  <span className="text-xl">🟨</span>
                  <span className="text-[10px] font-bold text-slate-500 mt-1">Kids</span>
                  <span className="text-lg font-black text-slate-800">{data.kids}</span>
              </div>
          </div>
      </div>
  );

  const getStatusColor = (s: string) => {
      const st = String(s || 'VAC').toUpperCase();
      if(st === 'HOUSE USE' || st === 'SHOW VILLA') return 'text-fuchsia-700 bg-fuchsia-100 border border-fuchsia-200';
      if(st === 'VM/VAC') return 'text-slate-500 bg-slate-200 border border-slate-300';
      if(st === 'VM/OCC') return 'text-indigo-700 bg-indigo-100 border border-indigo-200';
      if(st === 'VM/ARR') return 'text-blue-700 bg-blue-100 border border-blue-200';
      if(st === 'TMA (DAY)') return 'text-orange-700 bg-orange-100 border border-orange-200';
      if(st === 'TMA (NIGHT)') return 'text-purple-700 bg-purple-100 border border-purple-200';
      if(st.includes('DEP') && st.includes('ARR')) return 'text-purple-700 bg-purple-50 border border-purple-200';
      if(st.includes('TMA')) return 'text-orange-700 bg-orange-50'; 
      if(st === 'DAY USE') return 'text-amber-700 bg-amber-50'; 
      if(st.includes('OCC')) return 'text-emerald-700 bg-emerald-50';
      if(st.includes('ARR')) return 'text-blue-700 bg-blue-50';
      if(st.includes('DEP')) return 'text-rose-700 bg-rose-50';
      return 'text-slate-300';
  };

  // Opera House Status Metrics
  const operaStats = useMemo(() => {
      let occ = 0, arr = 0, dep = 0, deparr = 0, vac = 0, paxAdults = 0, paxKids = 0;
      masterList.forEach(r => {
          const st = String(r.status || 'VAC').toUpperCase();
          if (st.includes('DEP') && st.includes('ARR')) {
              deparr++;
              paxAdults += (r.incoming_pax_adults || r.pax_adults || 0);
              paxKids += (r.incoming_pax_kids || r.pax_kids || 0);
          } else if (st.includes('ARR')) {
              arr++;
              paxAdults += (r.pax_adults || 0);
              paxKids += (r.pax_kids || 0);
          } else if (st.includes('DEP')) {
              dep++;
          } else if (st.includes('OCC') || st.includes('HOUSE') || st === 'DAY USE') {
              occ++;
              paxAdults += (r.pax_adults || 0);
              paxKids += (r.pax_kids || 0);
          } else {
              vac++;
          }
      });
      return { occ, arr, dep, deparr, vac, paxAdults, paxKids };
  }, [masterList]);

  // Filtered Opera Grid List
  const filteredVillasList = useMemo(() => {
      return masterList.filter(row => {
          const st = String(row.status || 'VAC').toUpperCase();
          if (statusFilter !== 'ALL') {
              if (statusFilter === 'DEP/ARR' && !(st.includes('DEP') && st.includes('ARR'))) return false;
              if (statusFilter === 'ARR' && (!st.includes('ARR') || st.includes('DEP'))) return false;
              if (statusFilter === 'DEP' && (!st.includes('DEP') || st.includes('ARR'))) return false;
              if (statusFilter === 'OCC' && !st.includes('OCC')) return false;
              if (statusFilter === 'VAC' && st !== 'VAC' && st !== 'VM/VAC') return false;
          }
          if (searchQuery.trim()) {
              const q = searchQuery.toLowerCase();
              const matchVilla = row.villa_number === q.trim() || `v${row.villa_number}` === q.trim() || row.villa_number.includes(q);
              const matchGuest = (row.guest_name || '').toLowerCase().includes(q) || (row.incoming_guest_name || '').toLowerCase().includes(q);
              const matchGem = (row.gem_name || '').toLowerCase().includes(q);
              return matchVilla || matchGuest || matchGem;
          }
          return true;
      });
  }, [masterList, statusFilter, searchQuery]);

  return (
    <div className="min-h-screen bg-slate-100/70 p-4 md:p-6 pb-32 font-sans text-slate-800">
      
      {/* OPERA PMS HEADER */}
      <div className="flex flex-col xl:flex-row justify-between items-center mb-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm gap-4">
        <div className="flex items-center gap-4 w-full xl:w-auto justify-between">
           <div className="flex items-center gap-4">
               <div className="h-10 w-1.5 bg-[#6D2158] rounded-full shrink-0"></div>
               <div>
                 <div className="flex items-center gap-2">
                    <h1 className="text-xl font-black text-slate-800 tracking-tight">OPERA • Housekeeping Guest Management</h1>
                    <span className="text-[10px] font-black uppercase bg-[#6D2158]/10 text-[#6D2158] px-2 py-0.5 rounded-md">PMS Live</span>
                 </div>
                 <div className="flex flex-wrap items-center gap-2 mt-0.5">
                     <p className="text-xs text-slate-500 font-bold uppercase tracking-wide">
                        {new Date(selectedDate).toLocaleDateString('en-GB', { dateStyle: 'full' })}
                     </p>
                     {lastSyncTime && (
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                           <Clock size={10}/> Last Sync: {lastSyncTime}
                        </span>
                     )}
                 </div>
               </div>
           </div>
        </div>
        
        <div className="flex flex-wrap items-center justify-end gap-2 w-full xl:w-auto">
           <div className="flex items-center bg-slate-100 rounded-lg p-0.5 mr-1 border border-slate-200">
              <button onClick={() => changeDate(-1)} className="p-2 hover:bg-white rounded-md text-slate-600 shadow-sm cursor-pointer"><ChevronLeft size={16}/></button>
              <input 
                type="date" 
                value={selectedDate} 
                onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                className="px-2 text-xs font-black text-slate-700 bg-transparent outline-none cursor-pointer"
              />
              <button onClick={() => changeDate(1)} className="p-2 hover:bg-white rounded-md text-slate-600 shadow-sm cursor-pointer"><ChevronRight size={16}/></button>
           </div>
           
           {isAdmin && (
               <>
                   <button onClick={openRegisterModal} className="flex items-center gap-1.5 bg-[#6D2158] text-white hover:bg-[#5a1b49] px-3.5 py-2 rounded-lg text-xs font-black uppercase tracking-wider shadow-sm transition-all cursor-pointer">
                        <Plus size={15}/> <span>Register Guest</span>
                   </button>

                   <button onClick={handleRollOver} disabled={isRollingOver} className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-50">
                        {isRollingOver ? <Loader2 size={16} className="animate-spin"/> : <RotateCw size={16}/>} <span>Roll Over</span>
                   </button>

                   <input key={`occ-${fileInputKey}`} type="file" id="fileOcc" className="hidden" accept=".xml" onChange={(e) => handleFileProcess(e, 'OCC')} />
                   <button onClick={() => document.getElementById('fileOcc')?.click()} className="flex items-center gap-2 bg-white border border-slate-200 hover:border-emerald-600 text-slate-600 hover:text-emerald-700 px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer">
                      {isProcessing ? <Loader2 size={16} className="animate-spin"/> : <UploadCloud size={16}/>} <span>OCC XML</span>
                   </button>

                   <input key={`arr-${fileInputKey}`} type="file" id="fileXML" className="hidden" accept=".xml" onChange={(e) => handleFileProcess(e, 'ARRDEP_XML')} />
                   <button onClick={() => document.getElementById('fileXML')?.click()} className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-600 hover:text-white px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer">
                      {isProcessing ? <Loader2 size={16} className="animate-spin"/> : <UploadCloud size={16}/>} <span>Arrivals XML</span>
                   </button>

                   <input key={`memo-${fileInputKey}`} type="file" id="fileMemo" className="hidden" accept=".csv" onChange={(e) => handleFileProcess(e, 'MEMO_CSV')} />
                   <button onClick={() => document.getElementById('fileMemo')?.click()} className="flex items-center gap-2 bg-teal-50 border border-teal-200 text-teal-800 hover:bg-teal-600 hover:text-white px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer">
                      {isProcessing ? <Loader2 size={16} className="animate-spin"/> : <FileSpreadsheet size={16}/>} <span>Memo CSV</span>
                   </button>

                   <button onClick={() => setIsPasteModalOpen(true)} className="flex items-center gap-2 bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-600 hover:text-white px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer">
                      <FileSpreadsheet size={16}/> <span>Paste Memo</span>
                   </button>

                   <button onClick={() => setIsSarongModalOpen(true)} className="flex items-center gap-2 bg-pink-600 text-white px-3 py-2 rounded-lg text-xs font-bold shadow-md hover:bg-pink-700 transition-all cursor-pointer">
                      <Shirt size={16}/> <span>Sarongs</span>
                   </button>
               </>
           )}
        </div>
      </div>

      {/* OPERA HOUSE STATUS RIBBON & FILTER BAR */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm mb-4 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
              {([
                  { key: 'ALL', label: 'All Rooms', count: TOTAL_VILLAS, style: 'bg-slate-800 text-white' },
                  { key: 'OCC', label: 'In-House', count: operaStats.occ, style: 'bg-emerald-600 text-white' },
                  { key: 'ARR', label: 'Arrivals', count: operaStats.arr, style: 'bg-blue-600 text-white' },
                  { key: 'DEP', label: 'Departures', count: operaStats.dep, style: 'bg-rose-600 text-white' },
                  { key: 'DEP/ARR', label: 'Turnovers', count: operaStats.deparr, style: 'bg-purple-600 text-white' },
                  { key: 'VAC', label: 'Vacant', count: operaStats.vac, style: 'bg-slate-500 text-white' },
              ] as const).map(tab => (
                  <button
                      key={tab.key}
                      onClick={() => setStatusFilter(tab.key)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
                          statusFilter === tab.key 
                            ? `${tab.style} shadow-sm` 
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                  >
                      <span>{tab.label}</span>
                      <span className={`px-1.5 py-0.2 rounded text-[10px] ${statusFilter === tab.key ? 'bg-white/20 text-white' : 'bg-white text-slate-700'}`}>
                          {tab.count}
                      </span>
                  </button>
              ))}

              <div className="ml-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] font-black text-amber-900 flex items-center gap-1.5">
                  <BedDouble size={13} className="text-amber-600"/>
                  <span>In-House Pax: {operaStats.paxAdults + operaStats.paxKids} ({operaStats.paxAdults}A / {operaStats.paxKids}K)</span>
              </div>
          </div>

          <div className="relative w-full lg:w-72">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400"/>
              <input
                  type="text"
                  placeholder="Search Villa #, Guest Name, GEM..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-[#6D2158] focus:bg-white"
              />
          </div>
      </div>

      {/* MOBILE LIST VIEW */}
      <div className="md:hidden grid grid-cols-1 gap-4">
        {filteredVillasList.map((row) => {
            const isHouseUse = row.status === 'HOUSE USE' || (row.guest_name && String(row.guest_name).toUpperCase().includes('HOUSE USE'));
            const isDepArr = row.status === 'DEP/ARR';
            const showDep = !!expandedDepVillas[row.villa_number];

            // For DEP/ARR, show Arriving Guest info by default
            const displayGuest = isDepArr ? (row.incoming_guest_name || 'Incoming Arrival Guest') : row.guest_name;
            const displayAdults = isDepArr && row.incoming_pax_adults ? row.incoming_pax_adults : row.pax_adults;
            const displayKids = isDepArr && row.incoming_pax_kids ? row.incoming_pax_kids : row.pax_kids;
            const displayDates = isDepArr && row.incoming_stay_dates ? row.incoming_stay_dates : row.stay_dates;
            const displayArrTime = isDepArr ? (row.incoming_arrival_time || row.arrival_time) : row.arrival_time;
            const displayPrefs = isDepArr && row.incoming_preferences ? row.incoming_preferences : row.preferences;

            return (
          <div key={row.villa_number} onClick={() => { if(isAdmin){ openEditModal(row); } }} className={`bg-white rounded-2xl p-4 shadow-sm border flex flex-col gap-3 relative ${row.status === 'VAC' ? 'border-slate-100 bg-slate-50/30' : 'border-slate-200 active:scale-[0.98] transition-transform cursor-pointer'} ${isHouseUse ? 'bg-fuchsia-50/30 border-fuchsia-100' : ''}`}>
              
              <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                     <span className="font-black text-2xl text-slate-800 tracking-tighter">V{row.villa_number}</span>
                     <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider shadow-sm ${getStatusColor(row.status)}`}>{row.status}</span>
                  </div>
                  
                  <div className="flex items-center gap-1.5">
                      {isDepArr && (
                          <button
                              onClick={(e) => toggleDepInfo(row.villa_number, e)}
                              className="px-2 py-1 rounded-lg text-[10px] font-black uppercase bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1 cursor-pointer"
                          >
                              {showDep ? <EyeOff size={12}/> : <Eye size={12}/>}
                              <span>{showDep ? 'Hide Dep' : 'View Dep'}</span>
                          </button>
                      )}
                      {isAdmin && (
                          <button onClick={(e) => { e.stopPropagation(); setMoveData({from: row.villa_number, to: '', type: 'VM/OCC', isPartial: false, mergeDest: true}); setIsMoveModalOpen(true); }} className="p-2 bg-slate-50 text-slate-400 rounded-lg shadow-sm active:bg-slate-100 cursor-pointer">
                             <ArrowRightLeft size={14}/>
                          </button>
                      )}
                  </div>
              </div>

              {row.status !== 'VAC' && (
                  <div className="flex flex-col gap-1.5 mt-1 border-t border-slate-100 pt-3">
                      {isDepArr && (
                          <span className="text-[9px] font-black uppercase text-blue-600 tracking-wider">Arriving Guest</span>
                      )}
                      {displayGuest ? displayGuest.split(' & ').map((name, idx) => {
                          const isChild = name.includes('Mstr') || name.includes('Miss') || name.includes(' yrs)');
                          return (
                              <div key={idx} className="flex items-start gap-2">
                                  {isChild ? <Baby size={14} className="text-amber-500 mt-0.5 shrink-0"/> : <User size={14} className="text-slate-400 mt-0.5 shrink-0"/>}
                                  <span className="text-xs font-bold text-slate-700 leading-tight">{name.trim()}</span>
                              </div>
                          );
                      }) : <span className="text-xs font-bold text-slate-300 italic">- No Profile -</span>}

                      {isDepArr && showDep && (
                          <div className="mt-2 p-2.5 bg-rose-50/90 rounded-xl border border-rose-200 space-y-1" onClick={e => e.stopPropagation()}>
                              <span className="text-[9px] font-black uppercase text-rose-700 block">Departing Guest Info</span>
                              <span className="text-xs font-bold text-slate-800 block">{row.guest_name || 'No departing profile'}</span>
                              <div className="flex flex-wrap gap-2 text-[10px] font-mono text-rose-700 font-bold">
                                  {row.departure_time && <span>Dep Time: {row.departure_time}</span>}
                                  {row.stay_dates && <span>Stay: {row.stay_dates}</span>}
                              </div>
                          </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2 mt-2">
                          {(displayAdults > 0 || displayKids > 0) && (
                              <div className="bg-slate-100 px-2 py-1 rounded-md flex items-center gap-1 text-[10px] font-bold text-slate-600">
                                  Pax: {displayAdults + displayKids} {displayKids > 0 && <span className="text-amber-500">({displayKids} K)</span>}
                              </div>
                          )}
                          {row.meal_plan && <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md text-[10px] font-black uppercase">{row.meal_plan}</span>}
                          {row.gem_name && <span className="bg-purple-50 text-purple-700 px-2 py-1 rounded-md text-[10px] font-black uppercase">GEM: {row.gem_name}</span>}
                          {displayDates && <span className="text-[10px] font-mono font-bold text-slate-400 border border-slate-200 px-2 py-1 rounded-md">{displayDates}</span>}
                      </div>

                      {(displayArrTime || (!isDepArr && row.departure_time)) && (
                          <div className="flex gap-3 mt-2 text-[10px] font-bold font-mono">
                              {displayArrTime && <span className="text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">Arr: {displayArrTime}</span>}
                              {!isDepArr && row.departure_time && <span className="text-rose-600 bg-rose-50 px-2 py-1 rounded border border-rose-100">Dep: {row.departure_time}</span>}
                          </div>
                      )}

                      {displayPrefs && (<div className="flex items-center gap-1 mt-2 text-[10px] text-rose-500 font-bold bg-rose-50 p-2 rounded-lg border border-rose-100"><Heart size={12} fill="currentColor"/> Preferences Logged</div>)}
                  </div>
              )}
          </div>
        )})}
      </div>

      {/* DESKTOP OPERA TABLE VIEW */}
      <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-black text-slate-500 tracking-wider">
                <th className="py-3 px-4 w-28 sticky left-0 bg-slate-50 z-20 border-r border-slate-100">Room / Villa</th>
                <th className="py-3 px-4 w-28">HK Status</th>
                <th className="py-3 px-4">Guest Name / Folio</th>
                <th className="py-3 px-4 w-20 text-center">Pax</th>
                <th className="py-3 px-4 w-32">GEM</th>
                <th className="py-3 px-4 w-24">Meal</th>
                <th className="py-3 px-4 w-32 text-right">Stay Dates</th>
                <th className="py-3 px-4 w-32 text-right">ETA / ETD</th>
                <th className="py-3 px-4 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredVillasList.map((row) => {
                  const isHouseUse = row.status === 'HOUSE USE' || (row.guest_name && String(row.guest_name).toUpperCase().includes('HOUSE USE'));
                  const isDepArr = row.status === 'DEP/ARR';
                  const showDep = !!expandedDepVillas[row.villa_number];

                  // For DEP/ARR, show Arriving Guest info only by default
                  const displayGuest = isDepArr ? (row.incoming_guest_name || 'Incoming Arrival Guest') : row.guest_name;
                  const displayAdults = isDepArr && row.incoming_pax_adults ? row.incoming_pax_adults : row.pax_adults;
                  const displayKids = isDepArr && row.incoming_pax_kids ? row.incoming_pax_kids : row.pax_kids;
                  const displayDates = isDepArr && row.incoming_stay_dates ? row.incoming_stay_dates : row.stay_dates;
                  const displayArrTime = isDepArr ? (row.incoming_arrival_time || row.arrival_time) : row.arrival_time;
                  const displayPrefs = isDepArr && row.incoming_preferences ? row.incoming_preferences : row.preferences;

                  return (
                <tr key={row.villa_number} className={`hover:bg-slate-50 transition-colors group ${row.status === 'VAC' ? 'bg-slate-50/30' : ''} ${isHouseUse ? 'bg-fuchsia-50/30' : ''}`}>
                  
                  <td className="py-2 px-4 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-50">
                      <div className="flex items-center gap-2">
                          {isAdmin && (
                              <button onClick={() => { setMoveData({from: row.villa_number, to: '', type: 'VM/OCC', isPartial: false, mergeDest: true}); setIsMoveModalOpen(true); }} className="p-1.5 text-slate-300 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 rounded-md transition-colors opacity-100 lg:opacity-0 lg:group-hover:opacity-100 cursor-pointer" title="Room Move">
                                  <ArrowRightLeft size={12}/>
                              </button>
                          )}
                          <span className="font-black text-sm text-slate-800">{row.villa_number}</span>
                      </div>
                  </td>

                  <td className="py-2 px-4">
                      <div className="flex flex-col items-start gap-1">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${getStatusColor(row.status)}`}>{row.status}</span>
                          {isDepArr && (
                              <button
                                  type="button"
                                  onClick={(e) => toggleDepInfo(row.villa_number, e)}
                                  className="text-[9px] font-black text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                  {showDep ? <EyeOff size={9}/> : <Eye size={9}/>}
                                  <span>{showDep ? 'Hide Dep' : 'View Dep'}</span>
                              </button>
                          )}
                      </div>
                  </td>
                  
                  <td className="py-2 px-4 cursor-pointer" onClick={() => { if(isAdmin){ openEditModal(row); } }}>
                    <div className="flex flex-col gap-1 py-1">
                        {displayGuest ? displayGuest.split(' & ').map((name, idx) => {
                            const isChild = name.includes('Mstr') || name.includes('Miss') || name.includes(' yrs)');
                            return (
                                <div key={idx} className="flex items-start gap-1.5">
                                    {isChild ? (
                                        <Baby size={12} className="text-amber-500 mt-0.5 shrink-0"/>
                                    ) : (
                                        <User size={12} className="text-slate-400 mt-0.5 shrink-0"/>
                                    )}
                                    <span className={`text-[11px] font-bold leading-tight transition-colors ${isAdmin ? 'group-hover:text-[#6D2158]' : ''} ${row.status === 'VAC' ? 'text-slate-300' : 'text-slate-800'}`}>
                                        {name.trim()}
                                    </span>
                                </div>
                            );
                        }) : (
                            <span className="text-xs font-bold text-slate-200">-</span>
                        )}

                        {/* Optional Departing Guest Info Drawer when toggled on DEP/ARR */}
                        {isDepArr && showDep && (
                            <div onClick={e => e.stopPropagation()} className="mt-1 p-2 bg-rose-50/90 border border-rose-200 rounded-lg text-[10px] flex items-center justify-between gap-3">
                                <div>
                                    <span className="font-black uppercase text-rose-700 mr-1.5">Departing:</span>
                                    <span className="font-bold text-slate-800">{row.guest_name || 'No departing guest recorded'}</span>
                                </div>
                                <div className="font-mono font-bold text-rose-700 shrink-0">
                                    {row.departure_time ? `ETD: ${row.departure_time}` : ''} {row.stay_dates ? `(${row.stay_dates})` : ''}
                                </div>
                            </div>
                        )}

                        {displayPrefs && (<div className="flex items-center gap-1 mt-0.5 text-[9px] text-rose-500 font-bold"><Heart size={8} fill="currentColor"/> Preferences Saved</div>)}
                    </div>
                  </td>
                  
                  <td className="py-2 px-4 text-center">
                      {(displayAdults > 0 || displayKids > 0) && (
                          <div className="flex flex-col items-center">
                              <span className="text-[11px] font-black text-slate-700">{displayAdults + displayKids}</span>
                              {displayKids > 0 && <span className="text-[8px] font-bold text-amber-500 uppercase">{displayKids} Kids</span>}
                          </div>
                      )}
                  </td>
                  <td className="py-2 px-4 text-[10px] font-bold text-slate-600 uppercase">{row.gem_name}</td>
                  <td className="py-2 px-4 text-[10px] text-slate-600 font-bold">{row.meal_plan}</td>
                  <td className="py-2 px-4 text-right text-[10px] font-mono font-bold text-slate-500">{displayDates}</td>
                  <td className="py-2 px-4 text-right text-[10px] font-mono font-bold text-slate-600">
                      {displayArrTime && <span className="block text-emerald-600">ETA: {displayArrTime}</span>}
                      {!isDepArr && row.departure_time && <span className="block text-rose-600">ETD: {row.departure_time}</span>}
                  </td>
                  <td className="py-2 px-4 text-right">
                    {isAdmin && (
                        <button onClick={() => openEditModal(row)} className="p-1.5 text-slate-300 hover:text-[#6D2158] hover:bg-[#6D2158]/10 rounded-lg transition-colors opacity-100 lg:opacity-0 lg:group-hover:opacity-100 cursor-pointer" title="Open Opera Folio"><Edit3 size={14}/></button>
                    )}
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>

      {/* CHANGES MODAL */}
      {diffModalOpen && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
              <div className="bg-slate-50 p-6 border-b border-slate-200 flex justify-between items-center">
                  <div>
                      <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        {changes.length > 0 && changes.some(c => c.type === 'DISCREPANCY') ? <AlertTriangle className="text-red-500"/> : changes.length > 0 ? <AlertTriangle className="text-amber-500"/> : <CheckCircle className="text-emerald-500"/>}
                        {changes[0]?.type === 'INFO SYNC' ? 'Data Overlay Sync' : 'Review Updates'}
                      </h3>
                      <p className="text-sm text-slate-500 mt-1">
                          {changes.length === 0 ? "The uploaded data matches the current database." : `Found ${changes.length} change(s) ready to synchronize.`}
                      </p>
                  </div>
                  <button onClick={() => setDiffModalOpen(false)} className="cursor-pointer"><X size={24} className="text-slate-400 hover:text-slate-600"/></button>
              </div>

              <div className="overflow-y-auto p-0 flex-1">
                  {changes.length === 0 ? (
                      <div className="p-12 text-center text-slate-400">
                          <p>Ready to sync.</p>
                      </div>
                  ) : (
                      <table className="w-full text-left text-sm">
                          <thead className="bg-slate-50 text-xs uppercase font-bold text-slate-400 sticky top-0 shadow-sm z-10">
                              <tr>
                                  <th className="p-4 w-20">Villa</th>
                                  <th className="p-4 w-32">Type</th>
                                  <th className="p-4 w-48">Current Data</th>
                                  <th className="p-4 w-8"></th>
                                  <th className="p-4">New Data</th>
                                  <th className="p-4 w-12 text-right">Action</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                              {changes.map((c, i) => {
                                  const pendingRec = pendingData.find(p => p.villa_number === c.villa);
                                  return (
                                      <tr key={i} className="hover:bg-slate-50">
                                          <td className="p-4 font-bold text-slate-700">{c.villa}</td>
                                          <td className="p-4">
                                              <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                                                  c.type === 'DISCREPANCY' ? 'bg-red-100 text-red-700 border border-red-300' :
                                                  c.type === 'ALLOC CHANGE' ? 'bg-indigo-100 text-indigo-700' :
                                                  c.type === 'MOVED OUT' ? 'bg-slate-200 text-slate-500' :
                                                  c.type === 'DEP/ARR DUAL' ? 'bg-purple-100 text-purple-700' :
                                                  c.type === 'MEMO ARRIVAL' ? 'bg-teal-100 text-teal-800' :
                                                  c.type === 'MEMO DEPARTURE' ? 'bg-rose-100 text-rose-800' :
                                                  c.type === 'ROOM MOVE' ? 'bg-indigo-100 text-indigo-800' :
                                                  'bg-emerald-100 text-emerald-700'
                                              }`}>{c.type}</span>
                                          </td>
                                          <td className="p-4 text-slate-500">
                                              <div className="text-xs">{c.oldGuest ? c.oldGuest.substring(0, 24) : 'Vacant'}</div>
                                              <div className="text-[10px] font-bold uppercase opacity-50">{c.oldStatus}</div>
                                          </td>
                                          <td className="p-4 text-slate-300"><ArrowRight size={16}/></td>
                                          <td className="p-4 text-slate-800 font-medium">
                                              {pendingRec ? (
                                                  <div className="flex flex-col gap-2">
                                                      <div className="flex items-center gap-2">
                                                          <select 
                                                              className="p-1 border border-slate-200 rounded text-[10px] font-bold uppercase outline-none focus:border-blue-400"
                                                              value={pendingRec.status}
                                                              onChange={(e) => {
                                                                  updatePendingRecord(c.villa, 'status', e.target.value);
                                                                  const newChanges = [...changes];
                                                                  newChanges[i].newStatus = e.target.value;
                                                                  setChanges(newChanges);
                                                              }}
                                                          >
                                                              {['VAC','OCC','ARR','DEP','DEP/ARR','VM/VAC','VM/OCC','VM/ARR','TMA (Day)','TMA (Night)','DAY USE','HOUSE USE','SHOW VILLA'].map(s=><option key={s} value={s}>{s}</option>)}
                                                          </select>
                                                          <div className="text-xs leading-tight font-bold text-slate-700">{c.newGuest ? c.newGuest : 'Vacant'}</div>
                                                      </div>
                                                  </div>
                                              ) : (
                                                  <>
                                                      <div className="text-xs leading-tight">{c.newGuest ? c.newGuest : 'Vacant'}</div>
                                                      <div className="text-[10px] font-bold uppercase mt-1 text-[#6D2158]">{c.newStatus}</div>
                                                  </>
                                              )}
                                          </td>
                                          <td className="p-4 text-right">
                                             <button onClick={() => removeChange(i)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer" title="Discard this change">
                                                 <Trash2 size={16}/>
                                             </button>
                                          </td>
                                      </tr>
                                  );
                              })}
                          </tbody>
                      </table>
                  )}
              </div>

              <div className="p-6 border-t border-slate-200 bg-slate-50 flex justify-end gap-3 shrink-0">
                  <button onClick={() => setDiffModalOpen(false)} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-white hover:shadow-sm transition-all cursor-pointer">Cancel</button>
                  <button 
                      onClick={handleApproveUpdate} 
                      disabled={isProcessing}
                      className="px-6 py-3 rounded-xl font-bold bg-[#6D2158] text-white shadow-lg hover:bg-[#5a1b49] transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                      {isProcessing ? <Loader2 size={16} className="animate-spin" /> : null}
                      {changes.length === 0 ? "Force Overwrite" : "Approve & Update Instantly"}
                  </button>
              </div>
           </div>
        </div>
      )}

      {/* SARONG MODAL */}
      {isSarongModalOpen && isAdmin && (
          <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                  <div className="bg-pink-600 p-5 text-white flex justify-between items-center">
                      <h3 className="text-lg font-bold flex items-center gap-2"><Shirt size={18}/> Tuesday Sarong Allocation</h3>
                      <button onClick={() => setIsSarongModalOpen(false)} className="bg-white/10 p-1.5 rounded-full hover:bg-white/20 cursor-pointer"><X size={18}/></button>
                  </div>
                  <div className="p-6 space-y-6 bg-slate-100">
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                          {renderSarongArea("Jetty A (1-35)", getSarongCounts().jettyA)}
                          {renderSarongArea("Jetty B (37-50)", getSarongCounts().jettyB)}
                          {renderSarongArea("Jetty C (59-79)", getSarongCounts().jettyC)}
                          {renderSarongArea("Beach Villas", getSarongCounts().beach)}
                      </div>

                      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row justify-between items-center gap-6">
                          <div>
                              <h3 className="text-lg font-black text-slate-800">Total Island Distribution</h3>
                              <p className="text-xs text-slate-400 font-bold mt-1">Excludes Departures, TMA, and House Use</p>
                          </div>
                          <div className="flex gap-4">
                              <div className="flex flex-col items-center justify-center">
                                  <span className="text-2xl">⬛</span>
                                  <span className="text-[10px] font-bold text-slate-500 mt-1 uppercase">Adult Males</span>
                                  <span className="text-2xl font-black text-slate-800">{getSarongCounts().total.male}</span>
                              </div>
                              <div className="flex flex-col items-center justify-center">
                                  <span className="text-2xl">🟥</span>
                                  <span className="text-[10px] font-bold text-slate-500 mt-1 uppercase">Adult Females</span>
                                  <span className="text-2xl font-black text-slate-800">{getSarongCounts().total.female}</span>
                              </div>
                              <div className="flex flex-col items-center justify-center">
                                  <span className="text-2xl">🟨</span>
                                  <span className="text-[10px] font-bold text-slate-500 mt-1 uppercase">Kids</span>
                                  <span className="text-2xl font-black text-slate-800">{getSarongCounts().total.kids}</span>
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* MANUAL MOVE MODAL */}
      {isMoveModalOpen && isAdmin && (
          <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                  <div className="bg-[#6D2158] p-5 text-white flex justify-between items-center">
                      <h3 className="text-lg font-bold flex items-center gap-2"><ArrowRightLeft size={18}/> Manual Villa Move</h3>
                      <button onClick={() => setIsMoveModalOpen(false)} className="bg-white/10 p-1.5 rounded-full hover:bg-white/20 cursor-pointer"><X size={18}/></button>
                  </div>
                  <div className="p-6 space-y-4">
                      <div className="flex items-center gap-4">
                          <div className="flex-1">
                              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">From Villa(s)</label>
                              <input type="text" className="w-full p-3 bg-white border border-slate-200 rounded-xl text-lg font-black text-center text-slate-600 outline-none focus:border-indigo-500" value={moveData.from} onChange={e => setMoveData({...moveData, from: e.target.value})} placeholder="e.g. 12"/>
                          </div>
                          <ArrowRight className="text-slate-300 mt-4" size={24}/>
                          <div className="flex-1">
                              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">To Villa</label>
                              <input type="text" autoFocus className="w-full p-3 bg-white border-2 border-indigo-200 rounded-xl text-lg font-black text-center text-indigo-700 outline-none focus:border-indigo-500" placeholder="00" value={moveData.to} onChange={e => setMoveData({...moveData, to: e.target.value})}/>
                          </div>
                      </div>

                      <div className="mt-1 flex flex-col gap-2">
                          <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 cursor-pointer">
                              <input type="checkbox" checked={moveData.mergeDest} onChange={e => setMoveData({...moveData, mergeDest: e.target.checked})} className="w-4 h-4 rounded border-slate-300 text-[#6D2158] focus:ring-[#6D2158]"/>
                              Merge with existing guests in destination
                          </label>
                          <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 cursor-pointer">
                              <input type="checkbox" checked={moveData.isPartial} onChange={e => setMoveData({...moveData, isPartial: e.target.checked})} className="w-4 h-4 rounded border-slate-300 text-[#6D2158] focus:ring-[#6D2158]"/>
                              Partial Move (Keep Source Villa Occupied)
                          </label>
                      </div>

                      <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Move Type</label>
                          <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none" value={moveData.type} onChange={e => setMoveData({...moveData, type: e.target.value})}>
                              <option value="VM/OCC">Stayover Move (VM/OCC)</option>
                              <option value="VM/ARR">Arrival Move (VM/ARR)</option>
                              <option value="DAY USE">Day Use Move (DAY USE)</option>
                          </select>
                      </div>
                      
                      <button onClick={handleManualMove} disabled={isProcessing} className="w-full bg-[#6D2158] text-white py-3 rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg hover:bg-[#5a1b49] transition-all flex justify-center items-center gap-2 mt-2 cursor-pointer">
                          {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <RotateCw size={16}/>} Execute Move
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* OPERA RESERVATION FOLIO / REGISTER & EDIT MODAL */}
      {isEditOpen && editingRecord && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-lg rounded-3xl shadow-xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
              <div className="bg-[#6D2158] p-6 text-white shrink-0">
                  <div className="flex justify-between items-start">
                     <div>
                         <div className="flex items-center gap-2">
                            <ShieldCheck size={16} className="text-amber-300"/>
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/80">
                                {isNewRegistration ? 'New Reservation Registration' : 'Opera Guest Reservation Folio'}
                            </span>
                         </div>
                         <h3 className="text-2xl font-black mt-0.5">
                            Villa {editingRecord.villa_number}
                         </h3>
                         <p className="text-white/80 text-[10px] font-bold uppercase mt-0.5 tracking-widest">
                            Folio ID: {editingRecord.stay_id || `STAY_${editingRecord.villa_number}_${selectedDate.replace(/-/g, '')}`}
                         </p>
                     </div>
                     <button onClick={() => setIsEditOpen(false)} className="bg-white/10 p-1.5 rounded-full hover:bg-white/20 cursor-pointer"><X size={18}/></button>
                  </div>
                  <div className="flex gap-4 mt-5 text-xs font-bold uppercase tracking-wider">
                      <button onClick={() => setActiveTab('details')} className={`pb-2 border-b-2 cursor-pointer ${activeTab === 'details' ? 'border-white text-white' : 'border-transparent text-white/50'}`}>
                          {editingRecord.status === 'DEP/ARR' ? 'Arriving Folio' : 'Guest & Stay Details'}
                      </button>
                      <button onClick={() => setActiveTab('prefs')} className={`pb-2 border-b-2 cursor-pointer ${activeTab === 'prefs' ? 'border-white text-white' : 'border-transparent text-white/50'}`}>
                          Preferences & Notes
                      </button>
                      {editingRecord.status === 'DEP/ARR' && (
                          <button onClick={() => setActiveTab('departing')} className={`pb-2 border-b-2 cursor-pointer ${activeTab === 'departing' ? 'border-amber-300 text-amber-300' : 'border-transparent text-white/50'}`}>
                              Departing Guest
                          </button>
                      )}
                  </div>
              </div>

              <div className="p-6 overflow-y-auto flex-1">
                 {activeTab === 'details' ? (
                     <div className="space-y-4">
                        <div className="grid grid-cols-4 gap-3">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Room / Villa</label>
                                <select
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-slate-800 outline-none"
                                    value={editingRecord.villa_number}
                                    onChange={e => {
                                        const v = e.target.value;
                                        setEditingRecord({...editingRecord, villa_number: v});
                                        setLinkedSuitesSelection(getAssociatedVillas(v));
                                    }}
                                >
                                    {Array.from({ length: TOTAL_VILLAS }, (_, i) => String(i + 1)).map(v => (
                                        <option key={v} value={v}>V{v}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Status</label>
                                <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none" value={editingRecord.status || 'VAC'} onChange={e => setEditingRecord({...editingRecord, status: e.target.value})}>
                                    {['VAC','OCC','ARR','DEP','DEP/ARR','VM/VAC','VM/OCC','VM/ARR','TMA (Day)','TMA (Night)','DAY USE','HOUSE USE','SHOW VILLA'].map(s=><option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">GEM</label>
                                <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none" value={editingRecord.gem_name || ''} onChange={e => setEditingRecord({...editingRecord, gem_name: e.target.value})}/>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Meal Plan</label>
                                <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none" value={editingRecord.meal_plan || ''} onChange={e => setEditingRecord({...editingRecord, meal_plan: e.target.value})}>
                                    <option value="">MP</option>
                                    <option value="BB">BB</option>
                                    <option value="HB">HB</option>
                                    <option value="FB">FB</option>
                                    <option value="RO">RO</option>
                                    <option value="AI">AI</option>
                                </select>
                            </div>
                        </div>

                        {/* IN-FOLIO EXTENSION / LINKED VILLAS SELECTOR */}
                        <div className="bg-purple-50/70 p-3.5 rounded-2xl border border-purple-100 space-y-2.5">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black text-[#6D2158] uppercase tracking-wider flex items-center gap-1.5">
                                    <Link2 size={13}/> Choose / Link Additional Villas
                                </span>
                                <span className="text-[9px] text-slate-400 font-bold">Multi-villa reservation</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {['56', '58', '88'].filter(v => v !== editingRecord.villa_number).map(suite => {
                                    const isLinked = linkedSuitesSelection.includes(suite);
                                    return (
                                        <button
                                            key={suite}
                                            type="button"
                                            onClick={() => toggleLinkedSuite(suite)}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                                                isLinked
                                                    ? 'bg-[#6D2158] text-white border-[#6D2158] shadow-xs'
                                                    : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300'
                                            }`}
                                        >
                                            {isLinked ? `✓ Villa ${suite}` : `+ Villa ${suite}`}
                                        </button>
                                    );
                                })}

                                {linkedSuitesSelection.filter(v => !['56', '58', '88'].includes(v)).map(customV => (
                                    <button
                                        key={customV}
                                        type="button"
                                        onClick={() => toggleLinkedSuite(customV)}
                                        className="px-3 py-1.5 rounded-xl text-xs font-black border bg-[#6D2158] text-white border-[#6D2158] cursor-pointer"
                                    >
                                        ✓ Villa {customV} ✕
                                    </button>
                                ))}

                                <div className="flex items-center gap-1 ml-auto">
                                    <input
                                        type="text"
                                        placeholder="Villa #"
                                        value={customLinkInput}
                                        onChange={e => setCustomLinkInput(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddCustomLinkVilla())}
                                        className="w-16 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-center outline-none focus:border-[#6D2158]"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleAddCustomLinkVilla}
                                        className="px-2.5 py-1.5 bg-purple-100 hover:bg-purple-200 text-[#6D2158] rounded-lg text-xs font-black cursor-pointer"
                                    >
                                        Add
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* PARTIAL DEPARTURE PARTY MEMBER MANAGER */}
                        {parsedGuestList.length > 0 && (
                            <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 space-y-3">
                                <div className="flex justify-between items-center">
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">
                                        Party Members (Partial Departure Control)
                                    </label>
                                    <span className="text-[9px] text-slate-400 font-bold">Click to depart person early</span>
                                </div>

                                <div className="space-y-2">
                                    {parsedGuestList.map((g, idx) => (
                                        <div key={g.id} className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${g.is_departed ? 'bg-rose-50 border-rose-200 opacity-60' : 'bg-white border-slate-200'}`}>
                                            <div className="flex items-center gap-2 min-w-0">
                                                <User size={14} className={g.is_departed ? 'text-rose-400' : 'text-slate-500'} />
                                                <span className={`text-xs font-bold truncate ${g.is_departed ? 'line-through text-rose-800' : 'text-slate-800'}`}>
                                                    {g.name}
                                                </span>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const updated = [...parsedGuestList];
                                                    updated[idx].is_departed = !updated[idx].is_departed;
                                                    setParsedGuestList(updated);
                                                }}
                                                className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer ${
                                                    g.is_departed ? 'bg-rose-200 text-rose-800' : 'bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-700'
                                                }`}
                                            >
                                                {g.is_departed ? 'Departed' : 'Depart Early'}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                                {editingRecord.status === 'DEP/ARR' ? 'Arriving Guest Name(s)' : 'Guest Name(s)'}
                            </label>
                            <textarea 
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold h-16 resize-none text-slate-700 outline-none" 
                                placeholder="e.g. Mr John Smith & Mrs Jane Smith"
                                value={editingRecord.status === 'DEP/ARR' ? (editingRecord.incoming_guest_name || '') : (editingRecord.guest_name || '')} 
                                onChange={e => {
                                    if (editingRecord.status === 'DEP/ARR') {
                                        setEditingRecord({...editingRecord, incoming_guest_name: e.target.value});
                                    } else {
                                        setEditingRecord({...editingRecord, guest_name: e.target.value});
                                    }
                                }}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-3">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Arrival Time (ETA)</label>
                                <input 
                                    type="time" 
                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-emerald-700 text-center outline-none" 
                                    value={editingRecord.status === 'DEP/ARR' ? (editingRecord.incoming_arrival_time || '') : (editingRecord.arrival_time || '')} 
                                    onChange={e => {
                                        if (editingRecord.status === 'DEP/ARR') {
                                            setEditingRecord({...editingRecord, incoming_arrival_time: e.target.value});
                                        } else {
                                            setEditingRecord({...editingRecord, arrival_time: e.target.value});
                                        }
                                    }}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Departure Time (ETD)</label>
                                <input 
                                    type="time" 
                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-rose-700 text-center outline-none" 
                                    value={editingRecord.departure_time || ''} 
                                    onChange={e => setEditingRecord({...editingRecord, departure_time: e.target.value})}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 border-t border-slate-100 pt-3">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Adults</label>
                                <input 
                                    type="number" 
                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-center text-slate-700 outline-none" 
                                    value={editingRecord.status === 'DEP/ARR' ? (editingRecord.incoming_pax_adults || 0) : (editingRecord.pax_adults || 0)} 
                                    onChange={e => {
                                        const val = parseInt(e.target.value, 10) || 0;
                                        if (editingRecord.status === 'DEP/ARR') setEditingRecord({...editingRecord, incoming_pax_adults: val});
                                        else setEditingRecord({...editingRecord, pax_adults: val});
                                    }}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Kids</label>
                                <input 
                                    type="number" 
                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-center text-slate-700 outline-none" 
                                    value={editingRecord.status === 'DEP/ARR' ? (editingRecord.incoming_pax_kids || 0) : (editingRecord.pax_kids || 0)} 
                                    onChange={e => {
                                        const val = parseInt(e.target.value, 10) || 0;
                                        if (editingRecord.status === 'DEP/ARR') setEditingRecord({...editingRecord, incoming_pax_kids: val});
                                        else setEditingRecord({...editingRecord, pax_kids: val});
                                    }}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Stay Dates</label>
                                <input 
                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-center text-slate-700 outline-none" 
                                    placeholder="DD/MM - DD/MM"
                                    value={editingRecord.status === 'DEP/ARR' ? (editingRecord.incoming_stay_dates || '') : (editingRecord.stay_dates || '')} 
                                    onChange={e => {
                                        if (editingRecord.status === 'DEP/ARR') setEditingRecord({...editingRecord, incoming_stay_dates: e.target.value});
                                        else setEditingRecord({...editingRecord, stay_dates: e.target.value});
                                    }}
                                />
                            </div>
                        </div>
                     </div>
                 ) : activeTab === 'prefs' ? (
                     <div className="h-full space-y-2">
                         <div className="flex items-center justify-between">
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                Guest Preferences & Permanent Profile Notes
                            </label>
                            <span className="text-[10px] text-rose-600 font-bold flex items-center gap-1">
                                <Heart size={12} fill="currentColor"/> Follows Villa Moves
                            </span>
                         </div>
                         <textarea 
                            className="w-full h-56 p-4 bg-amber-50/80 border border-amber-200 rounded-2xl text-xs font-bold leading-relaxed text-slate-800 outline-none focus:border-amber-400 resize-none" 
                            placeholder="e.g. Extra feather pillows, sparkling water only, allergic to shellfish..." 
                            value={editingRecord.status === 'DEP/ARR' ? (editingRecord.incoming_preferences || '') : (editingRecord.preferences || '')} 
                            onChange={e => {
                                if (editingRecord.status === 'DEP/ARR') setEditingRecord({...editingRecord, incoming_preferences: e.target.value});
                                else setEditingRecord({...editingRecord, preferences: e.target.value});
                            }}
                         />
                     </div>
                 ) : (
                     <div className="space-y-4">
                         <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-2">
                             <span className="text-[10px] font-black uppercase text-rose-700 tracking-wider block">
                                 Departing Guest Folio (Checking Out Today)
                             </span>
                             <div>
                                 <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Departing Guest Name</label>
                                 <input 
                                    className="w-full p-2.5 bg-white border border-rose-200 rounded-xl text-xs font-bold text-slate-800 outline-none" 
                                    value={editingRecord.guest_name || ''} 
                                    onChange={e => setEditingRecord({...editingRecord, guest_name: e.target.value})}
                                 />
                             </div>
                             <div className="grid grid-cols-2 gap-3 pt-1">
                                 <div>
                                     <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Departure Time (ETD)</label>
                                     <input 
                                        type="time" 
                                        className="w-full p-2.5 bg-white border border-rose-200 rounded-xl text-xs font-bold text-rose-700 text-center outline-none" 
                                        value={editingRecord.departure_time || ''} 
                                        onChange={e => setEditingRecord({...editingRecord, departure_time: e.target.value})}
                                     />
                                 </div>
                                 <div>
                                     <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Previous Stay Dates</label>
                                     <input 
                                        className="w-full p-2.5 bg-white border border-rose-200 rounded-xl text-xs font-bold text-center text-slate-700 outline-none" 
                                        value={editingRecord.stay_dates || ''} 
                                        onChange={e => setEditingRecord({...editingRecord, stay_dates: e.target.value})}
                                     />
                                 </div>
                             </div>
                         </div>
                     </div>
                 )}
              </div>

              <div className="p-6 pt-0 shrink-0">
                  <button onClick={handleSaveEdit} disabled={isProcessing} className="w-full bg-[#6D2158] hover:bg-[#5a1b49] text-white py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg transition-all flex justify-center items-center gap-2 cursor-pointer disabled:opacity-50">
                      {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Edit3 size={16}/>}
                      {isNewRegistration ? 'Confirm Registration' : 'Save Reservation Folio'}
                  </button>
                  {linkedSuitesSelection.length > 0 && (
                      <p className="text-center text-[9px] font-bold text-slate-400 uppercase mt-2">
                          Linking connected villa(s): {linkedSuitesSelection.map(v => `V${v}`).join(', ')}
                      </p>
                  )}
              </div>
           </div>
        </div>
      )}

      {/* PASTE MODAL */}
      {isPasteModalOpen && isAdmin && (
          <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                  <div className="bg-[#6D2158] p-5 text-white flex justify-between items-center">
                      <h3 className="text-lg font-bold flex items-center gap-2"><FileSpreadsheet size={18}/> Paste Operational Memo</h3>
                      <button onClick={() => setIsPasteModalOpen(false)} className="bg-white/10 p-1.5 rounded-full hover:bg-white/20 cursor-pointer"><X size={18}/></button>
                  </div>
                  <div className="p-6 space-y-4">
                      <p className="text-xs text-slate-500 font-bold">Copy table rows directly from Excel and paste below:</p>
                      <textarea 
                          className="w-full h-64 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-700 outline-none focus:border-[#6D2158] resize-none whitespace-pre" 
                          placeholder="Paste tab-delimited Excel rows here..." 
                          value={pastedText} 
                          onChange={(e) => setPastedText(e.target.value)}
                          autoFocus
                      />
                      <div className="flex justify-end gap-3 mt-4">
                          <button onClick={() => setIsPasteModalOpen(false)} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-50 hover:shadow-sm transition-all cursor-pointer">Cancel</button>
                          <button onClick={handlePasteSubmit} className="px-6 py-3 rounded-xl font-bold bg-[#6D2158] text-white shadow-lg hover:bg-[#5a1b49] transition-all flex items-center gap-2 cursor-pointer">
                              Process Memo Overlay
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* CONFIRM DIALOG */}
      {confirmDialog && confirmDialog.isOpen && (
          <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                  <div className="p-6">
                      <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-4">
                          <AlertTriangle size={24}/>
                      </div>
                      <h3 className="text-xl font-black text-slate-800 mb-2">{confirmDialog.title}</h3>
                      <p className="text-sm font-bold text-slate-500 leading-relaxed">{confirmDialog.message}</p>
                  </div>
                  <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3 justify-end">
                      <button onClick={() => setConfirmDialog(null)} className="px-5 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-200 transition-colors cursor-pointer">Cancel</button>
                      <button onClick={confirmDialog.onConfirm} className={`px-5 py-2.5 rounded-xl font-bold text-white shadow-md transition-all cursor-pointer ${confirmDialog.confirmColor || 'bg-[#6D2158] hover:bg-[#5a1b49]'}`}>
                          {confirmDialog.confirmText || 'Confirm'}
                      </button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
}
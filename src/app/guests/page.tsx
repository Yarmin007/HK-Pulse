"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Edit3, X, ChevronLeft, ChevronRight,
  FileSpreadsheet, Heart, ArrowRight, AlertTriangle, CheckCircle, Loader2, RotateCw, UploadCloud, User, Baby, ArrowRightLeft, Clock,
  Shirt, Trash2, Plus, Search, Eye, EyeOff, BedDouble, ShieldCheck, Link2, Check
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { normalizeVilla, extractDepInfo, projectGuestDay } from '@/lib/guestDay';
import { parseVillas } from '@/app/allocation/lib/constants';
import { saveMemoSummary } from '@/lib/memoSummary';
import { isSameGuest, parseOccXml, parseArrivalsXml, parseMemo, parseDelimited, applyOcc, applyArrivals, applyMemo, MEAL_PLAN_CODES, MEMO_GROUPS, type ImportResult } from '@/lib/guestImport';

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

export const MEAL_PLANS = MEAL_PLAN_CODES;

const ACTIVE_STATUSES = ['OCC', 'ARR', 'DEP/ARR', 'VM/OCC', 'VM/ARR'];

// Connected villas: 57 can extend into 56 / 58, 87 into 88. No other villa has link options.
const LINKABLE_VILLAS: Record<string, string[]> = { '57': ['56', '58'], '87': ['88'] };
const EXTENSION_PARENT: Record<string, string> = { '56': '57', '58': '57', '88': '87' };
const getAssociatedVillas = (villa: string) => LINKABLE_VILLAS[villa] || [];

// Helper to pack & unpack departing guest details into remarks column safely
type DepInfo = { name: string; time: string; dates: string };

const packRemarksWithDep = (cleanRemarks: string, depInfo: DepInfo | null): string => {
    const base = String(cleanRemarks || '').replace(/\[DEP_INFO\].*?\[\/DEP_INFO\]/g, '').trim();
    if (!depInfo || (!depInfo.name && !depInfo.time && !depInfo.dates)) return base;
    const tag = `[DEP_INFO]${JSON.stringify(depInfo)}[/DEP_INFO]`;
    return base ? `${base} ${tag}` : tag;
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
  dep_guest_name?: string;
  dep_stay_dates?: string;
};

type ChangeLog = {
    villa: string;
    type: string;
    oldGuest: string;
    newGuest: string;
    oldStatus: string;
    newStatus: string;
    note?: string;
    group?: string;
};

// Strips UI-only helper fields so Supabase only receives real hsk_daily_summary columns
const buildDbRowPayload = (rec: GuestRecord, reportDate: string) => {
    const depPayload: DepInfo | null =
        rec.status === 'DEP/ARR' && (rec.dep_guest_name || rec.departure_time || rec.dep_stay_dates)
            ? {
                  name: rec.dep_guest_name || '',
                  time: rec.departure_time || '',
                  dates: rec.dep_stay_dates || '',
              }
            : null;

    return {
        report_date: reportDate,
        villa_number: rec.villa_number,
        status: rec.status || 'VAC',
        guest_name: rec.guest_name || '',
        pax_adults: Number(rec.pax_adults) || 0,
        pax_kids: Number(rec.pax_kids) || 0,
        gem_name: rec.gem_name || '',
        meal_plan: rec.meal_plan || '',
        stay_dates: rec.stay_dates || '',
        arrival_time: rec.arrival_time || '',
        departure_time: rec.departure_time || '',
        preferences: rec.preferences || '',
        remarks: packRemarksWithDep(rec.remarks || '', depPayload),
        stay_id: rec.stay_id || '',
    };
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

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isNewRegistration, setIsNewRegistration] = useState(false);
  const [editingRecord, setEditingRecord] = useState<GuestRecord | null>(null);
  const [linkedSuitesSelection, setLinkedSuitesSelection] = useState<string[]>([]);
  const [editOriginVilla, setEditOriginVilla] = useState<string>('');
  const [parsedGuestList, setParsedGuestList] = useState<GuestProfileItem[]>([]);
  const [activeTab, setActiveTab] = useState<'details' | 'prefs' | 'departing'>('details');

  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [moveData, setMoveData] = useState({ from: '', to: '', type: 'VM/OCC', isPartial: false, mergeDest: true });

  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pastedText, setPastedText] = useState('');
  
  const [isSarongModalOpen, setIsSarongModalOpen] = useState(false);
  // Sarongs are for the Tuesday cocktail: counts and VA allocation come from the coming Tuesday
  // (the selected day if it is a Tuesday). Beach VAs who use the Jetty B pantry are a saved choice (by host),
  // so their villas move to Jetty B whatever villas they get that Tuesday.
  const sarongDate = (() => {
      const d = new Date(`${selectedDate}T00:00:00`);
      d.setDate(d.getDate() + ((2 - d.getDay() + 7) % 7));
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const [sarongRows, setSarongRows] = useState<any[]>([]);
  const [sarongVAs, setSarongVAs] = useState<{ id: string; name: string; villas: number[] }[]>([]);
  const [sarongHosts, setSarongHosts] = useState<string[]>([]);
  const [sarongAllocDate, setSarongAllocDate] = useState('');
  const [sarongCustomise, setSarongCustomise] = useState(false);
  const [sarongSaving, setSarongSaving] = useState(false);
  useEffect(() => {
      if (!isSarongModalOpen) return;
      (async () => {
          const allocFor = (d: string) => supabase.from('hsk_allocations').select('host_id, task_details, shift, hosts:hsk_hosts(id, host_id, full_name, nicknames)').eq('report_date', d).eq('area', 'villa');
          const [{ rows }, tueAlloc, saved] = await Promise.all([
              projectGuestDay(sarongDate),
              allocFor(sarongDate),
              supabase.from('hsk_constants').select('label').eq('type', 'sarong_jetty_b').limit(1),
          ]);
          // Tuesday's allocation is often made the night before: until then use the latest allocation before it
          let alloc = tueAlloc, allocDate = sarongDate;
          if (!tueAlloc.data?.length) {
              const { data: last } = await supabase.from('hsk_allocations').select('report_date').eq('area', 'villa').lt('report_date', sarongDate).order('report_date', { ascending: false }).limit(1);
              if (last?.[0]?.report_date) { allocDate = last[0].report_date; alloc = await allocFor(allocDate); }
          }
          setSarongAllocDate(allocDate);
          setSarongRows(rows.filter((r: any) => Number(normalizeVilla(r.villa_number)) > 0));
          setSarongVAs((alloc.data || []).map((a: any) => {
              const h = Array.isArray(a.hosts) ? a.hosts[0] : a.hosts;
              const name = h?.nicknames ? String(h.nicknames).split(',')[0].trim() : h?.full_name || 'VA';
              return { id: String(h?.id || a.host_id), name, villas: parseVillas(a.task_details || '') };
          }).filter(va => va.villas.length).sort((x, y) => Math.min(...x.villas) - Math.min(...y.villas)));
          try { setSarongHosts(JSON.parse(saved.data?.[0]?.label || '{}').hosts || []); } catch { setSarongHosts([]); }
      })();
  }, [isSarongModalOpen, sarongDate]);
  // Dashboard reminder links here with ?sarong=1
  useEffect(() => {
      if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('sarong') === '1') setIsSarongModalOpen(true);
  }, []);
  const saveSarongJettyB = async (hosts: string[]) => {
      setSarongSaving(true);
      await supabase.from('hsk_constants').delete().eq('type', 'sarong_jetty_b');
      const { error } = hosts.length ? await supabase.from('hsk_constants').insert({ type: 'sarong_jetty_b', label: JSON.stringify({ hosts }) }) : { error: null };
      setSarongSaving(false);
      if (error) toast.error('Not saved'); else { toast.success('Jetty B pantry villas saved'); setSarongCustomise(false); }
  };

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
                const { cleanRemarks, depInfo } = extractDepInfo(newRec.remarks);
                setMasterList(prev => prev.map(v => {
                    if (normalizeVilla(v.villa_number) === normalizeVilla(newRec.villa_number)) {
                        return {
                            ...v,
                            ...newRec,
                            villa_number: v.villa_number,
                            remarks: cleanRemarks,
                            dep_guest_name: depInfo?.name || '',
                            dep_stay_dates: depInfo?.dates || '',
                        };
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
        // Shared with the allocation board and the Front Office page (src/lib/guestDay.ts)
        const { rows: dbRecords, isProjected } = await projectGuestDay(selectedDate);

        const fullList: GuestRecord[] = [];
        for (let i = 1; i <= TOTAL_VILLAS; i++) {
          const villaNum = i.toString();
          const match = dbRecords?.find(r => normalizeVilla(r.villa_number) === villaNum);
          
          if (match) {
            const { cleanRemarks, depInfo } = extractDepInfo(match.remarks);
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
                departure_time: depInfo?.time || match.departure_time || '',
                preferences: match.preferences || '',
                remarks: cleanRemarks,
                stay_id: match.stay_id || '',
                dep_guest_name: depInfo?.name || '',
                dep_stay_dates: depInfo?.dates || '',
            });
          } else {
            fullList.push({
              report_date: selectedDate, villa_number: villaNum, status: 'VAC', guest_name: '',
              pax_adults: 0, pax_kids: 0, gem_name: '', meal_plan: '', stay_dates: '', remarks: '',
              preferences: '', arrival_time: '', departure_time: '', stay_id: '',
              dep_guest_name: '', dep_stay_dates: ''
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
          stay_id: '',
          dep_guest_name: '',
          dep_stay_dates: ''
      });
      setLinkedSuitesSelection([]);
      setEditOriginVilla('');
      setParsedGuestList([]);
      setActiveTab('details');
      setIsEditOpen(true);
  };

  const openEditModal = (row: GuestRecord) => {
      setIsNewRegistration(false);
      setEditingRecord({ ...row });
      const names = (row.guest_name || '')
          .split('&')
          .map(n => n.trim())
          .filter(Boolean)
          .map((n, idx) => ({ id: `g_${idx}_${Date.now()}`, name: n, is_departed: false }));
      setParsedGuestList(names);
      setLinkedSuitesSelection(getCurrentlyLinked(row.villa_number, row.stay_id));
      setEditOriginVilla(row.villa_number);
      setActiveTab('details');
      setIsEditOpen(true);
  };

  // Extension villas currently attached to this villa's stay (same stay_id)
  const getCurrentlyLinked = (villa: string, stayId?: string) => {
      if (!stayId) return [];
      return getAssociatedVillas(villa).filter(ext => masterList.find(r => r.villa_number === ext)?.stay_id === stayId);
  };

  const toggleLinkedSuite = (suiteNum: string) => {
      const norm = normalizeVilla(suiteNum);
      if (!norm || !editingRecord || !getAssociatedVillas(editingRecord.villa_number).includes(norm)) return;
      setLinkedSuitesSelection(prev =>
          prev.includes(norm) ? prev.filter(s => s !== norm) : [...prev, norm]
      );
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
        let finalRec: GuestRecord = { ...editingRecord, villa_number: cleanVilla };
        
        if (parsedGuestList.length > 0) {
            finalRec.guest_name = remainingGuests.join(' & ');
            if (remainingGuests.length === 0 && finalRec.status !== 'VAC') {
                finalRec.status = 'DEP';
            }
        }

        if (!finalRec.stay_id && finalRec.stay_dates) {
            // Same STAY_<villa>_<YYMMDD> format the XML importers generate
            const [dd, mm] = finalRec.stay_dates.split('-')[0].trim().split('/');
            if (dd && mm) finalRec.stay_id = `STAY_${finalRec.villa_number}_${selectedDate.slice(2, 4)}${mm.padStart(2, '0')}${dd.padStart(2, '0')}`;
        }

        // One person = one active villa
        if (ACTIVE_STATUSES.includes(finalRec.status) && finalRec.guest_name) {
            const clash = masterList.find(r =>
                r.villa_number !== finalRec.villa_number &&
                r.villa_number !== editOriginVilla &&
                ACTIVE_STATUSES.includes(r.status) &&
                isSameGuest(r.guest_name, finalRec.guest_name)
            );
            if (clash) {
                toast.error(`Guest already in-house in Villa ${clash.villa_number}. Use Villa Move instead.`);
                setIsProcessing(false);
                return;
            }
        }

        const masterRec = masterList.find(r => r.villa_number === finalRec.villa_number);
        if (!isNewRegistration && masterRec && editOriginVilla !== finalRec.villa_number &&
            masterRec.guest_name && ACTIVE_STATUSES.includes(masterRec.status) && !isSameGuest(masterRec.guest_name, finalRec.guest_name)) {
            toast.error(`Villa ${finalRec.villa_number} is occupied by ${masterRec.guest_name}. Use Villa Move instead.`);
            setIsProcessing(false);
            return;
        }
        const masterPayload = buildDbRowPayload(finalRec, selectedDate);
        
        const { error: masterErr } = masterRec?.id 
            ? await supabase.from('hsk_daily_summary').update(masterPayload).eq('id', masterRec.id) 
            : await supabase.from('hsk_daily_summary').insert([masterPayload]);

        if (masterErr) throw masterErr;

        const emptyRow = (villa: string, status = 'VAC') => ({
            report_date: selectedDate, villa_number: villa, status, guest_name: '', pax_adults: 0, pax_kids: 0,
            meal_plan: '', stay_dates: '', preferences: '', gem_name: '', stay_id: '', remarks: '',
            arrival_time: '', departure_time: ''
        });

        // Villa changed inside the folio: free up the original villa so the guest isn't listed twice
        if (!isNewRegistration && editOriginVilla && editOriginVilla !== finalRec.villa_number) {
            const originRec = masterList.find(r => r.villa_number === editOriginVilla);
            if (originRec?.id) {
                const { error } = await supabase.from('hsk_daily_summary').update(emptyRow(editOriginVilla, 'VM/VAC')).eq('id', originRec.id);
                if (error) throw error;
            }
            // Extensions that belonged to the old villa's stay are released too
            for (const ext of getAssociatedVillas(editOriginVilla)) {
                const extRec = masterList.find(r => r.villa_number === ext);
                if (extRec?.id && originRec?.stay_id && extRec.stay_id === originRec.stay_id && !extRec.guest_name) {
                    await supabase.from('hsk_daily_summary').update(emptyRow(ext)).eq('id', extRec.id);
                }
            }
        }

        // Linked extension villas: only 56/58 (for 57) and 88 (for 87)
        const previousStayId = masterRec?.stay_id || editingRecord.stay_id || '';
        for (const v of getAssociatedVillas(finalRec.villa_number)) {
            const targetRec = masterList.find(r => r.villa_number === v);
            const isSelected = linkedSuitesSelection.includes(v);
            const wasLinked = !!targetRec?.stay_id && (targetRec.stay_id === previousStayId || targetRec.stay_id === finalRec.stay_id);

            if (isSelected) {
                if (targetRec?.guest_name && ACTIVE_STATUSES.includes(targetRec.status) && !wasLinked) {
                    toast.error(`Villa ${v} has its own guest (${targetRec.guest_name}) — not linked.`);
                    continue;
                }
                const assocPayload = {
                    ...masterPayload,
                    villa_number: v,
                    guest_name: '',
                    pax_adults: 0,
                    pax_kids: 0,
                    arrival_time: '',
                    departure_time: '',
                    preferences: '',
                    remarks: ''
                };
                const { error } = targetRec?.id
                    ? await supabase.from('hsk_daily_summary').update(assocPayload).eq('id', targetRec.id)
                    : await supabase.from('hsk_daily_summary').insert([assocPayload]);
                if (error) throw error;
            } else if (wasLinked && targetRec?.id && !targetRec.guest_name) {
                // Unticked: release the extension villa
                const { error } = await supabase.from('hsk_daily_summary').update(emptyRow(v)).eq('id', targetRec.id);
                if (error) throw error;
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

  // SAFE & FAST APPROVAL: Updates existing rows by ID and batch-inserts new rows using exact DB columns
  const handleApproveUpdate = async () => {
      setIsProcessing(true);
      try {
          const finalPending = [...pendingData];

          // Extension villas (56/58 → 57, 88 → 87) follow their parent ONLY if they were already linked to its stay.
          // Nothing gets linked automatically — linking is a deliberate choice in the folio.
          Object.entries(EXTENSION_PARENT).forEach(([ext, parent]) => {
              const pExt = finalPending.find(p => p.villa_number === ext);
              const pParent = finalPending.find(p => p.villa_number === parent);
              const origParent = masterList.find(r => r.villa_number === parent);
              if (!pExt || !pParent || pExt.guest_name || !pExt.stay_id) return;
              if (pExt.stay_id !== origParent?.stay_id) return; // not linked to the parent's stay

              if (pParent.stay_id === pExt.stay_id) {
                  Object.assign(pExt, {
                      status: pParent.status === 'DEP/ARR' ? 'DEP' : pParent.status,
                      stay_dates: pParent.stay_dates,
                      meal_plan: pParent.meal_plan,
                      gem_name: pParent.gem_name
                  });
              } else {
                  // Parent now hosts a different stay: the old linked party leaves today (DEP/ARR) or is gone (VAC)
                  Object.assign(pExt, {
                      status: pParent.status === 'DEP/ARR' ? 'DEP' : 'VAC',
                      ...(pParent.status === 'DEP/ARR' ? {} : { stay_dates: '', stay_id: '', meal_plan: '', gem_name: '' })
                  });
              }
          });

          // Re-fetch existing row IDs for selectedDate to guarantee accurate updates vs inserts
          const { data: existingDbRows, error: fetchErr } = await supabase
              .from('hsk_daily_summary')
              .select('id, villa_number')
              .eq('report_date', selectedDate);

          if (fetchErr) throw fetchErr;

          const existingIdByVilla = new Map<string, string>();
          (existingDbRows || []).forEach((r: any) => {
              const v = normalizeVilla(r.villa_number);
              if (v && r.id) existingIdByVilla.set(v, r.id);
          });

          const updates: Array<{ id: string; payload: any }> = [];
          const inserts: any[] = [];

          for (const rec of finalPending) {
              const dbId = rec.id || existingIdByVilla.get(rec.villa_number);
              const payload = buildDbRowPayload(rec, selectedDate);

              if (dbId) {
                  updates.push({ id: dbId, payload });
              } else if (rec.status !== 'VAC' || rec.guest_name || rec.meal_plan || rec.gem_name || rec.preferences) {
                  inserts.push(payload);
              }
          }

          // Execute updates in parallel batches of 20
          const BATCH_SIZE = 20;
          for (let i = 0; i < updates.length; i += BATCH_SIZE) {
              const slice = updates.slice(i, i + BATCH_SIZE);
              const results = await Promise.all(
                  slice.map(u =>
                      supabase
                          .from('hsk_daily_summary')
                          .update(u.payload)
                          .eq('id', u.id)
                  )
              );
              const firstErr = results.find(r => r.error)?.error;
              if (firstErr) throw firstErr;
          }

          if (inserts.length > 0) {
              const { error: insertErr } = await supabase
                  .from('hsk_daily_summary')
                  .insert(inserts);
              if (insertErr) throw insertErr;
          }

          await fetchDailyData();
          setDiffModalOpen(false);
          toast.success("Synchronized & Updated Successfully!");
      } catch (err: any) {
          console.error("Approve update error:", err);
          toast.error("Sync failed: " + (err?.message || "Database error"));
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

          const toPayload = {
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
          };

          if (toRec.id) {
              const { error } = await supabase.from('hsk_daily_summary').update(toPayload).eq('id', toRec.id);
              if (error) throw error;
          } else {
              const { error } = await supabase.from('hsk_daily_summary').insert([toPayload]);
              if (error) throw error;
          }

          if (!moveData.isPartial) {
              for (const v of fromVillas) {
                  const sRec = masterList.find(r => r.villa_number === v);
                  if (sRec) {
                      const emptyPayload = {
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
                          remarks: ''
                      };
                      if (sRec.id) {
                          await supabase.from('hsk_daily_summary').update(emptyPayload).eq('id', sRec.id);
                      } else {
                          await supabase.from('hsk_daily_summary').insert([emptyPayload]);
                      }
                  }
              }
          }

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
      
      processOperationalMemo(pastedText);
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

      // Excel saves the memo CSV as Windows-1252; read it that way so accented names and quotes survive
      reader.readAsText(file, type === 'MEMO_CSV' ? 'windows-1252' : 'utf-8');
  };

  // Reports are parsed and merged in src/lib/guestImport.ts: a guest is one stay (villa + arrival date), so
  // names spelled differently in each report never create a "new" guest. Upload order: OCC → Arrivals XML → Memo.
  const showImport = (res: ImportResult) => {
      if (res.warnings.length) {
          res.warnings.forEach(w => toast.error(w, { duration: 7000 }));
          if (!res.changes.length) return;
      }
      if (!res.changes.length) { toast.success('Already up to date: nothing in this report changes the list.'); return; }
      setChanges(res.changes);
      setPendingData(res.rows as GuestRecord[]);
      setDiffModalOpen(true);
  };

  const runImport = (label: string, work: () => ImportResult) => {
      try {
          showImport(work());
      } catch (err: any) {
          console.error(`${label} import error:`, err);
          toast.error(`Failed to read ${label}: ${err?.message || 'Unknown error'}`);
      } finally {
          setIsProcessing(false);
      }
  };

  const processOCCXML = (xmlText: string) =>
      runImport('OCC XML', () => applyOcc(masterList, parseOccXml(xmlText), selectedDate, EXTENSION_VILLAS));

  const processArrDepXML = (xmlText: string) =>
      runImport('Arrivals XML', () => applyArrivals(masterList, parseArrivalsXml(xmlText), selectedDate));

  // Villas that had the TMA night crew yesterday: they check out this morning (time comes from the memo)
  const leavingCrewVillas = async () => {
      const [y, m, d] = selectedDate.split('-').map(Number);
      const prev = new Date(y, m - 1, d - 1);
      const prevDate = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
      const { rows } = await projectGuestDay(prevDate);
      return rows.filter((r: any) => /TMA/i.test(r.status || '') && !/DAY/i.test(r.status || '')).map((r: any) => normalizeVilla(r.villa_number)).filter(Boolean) as string[];
  };

  const processDailyMemoCSV = async (csvText: string) => {
      const memo = parseMemo(parseDelimited(csvText, ','), selectedDate);
      const leaving = await leavingCrewVillas().catch(() => [] as string[]);
      runImport('Memo', () => applyMemo(masterList, memo, selectedDate, leaving));
      // Same memo also fills the day's stats on the Allocation → Summary board (only when it is for this day).
      if (!memo.reportDate || memo.reportDate === selectedDate) {
          saveMemoSummary(csvText, selectedDate)
              .then(f => { if (f.length) toast.success(`Daily stats updated: ${f.join(', ')}`, { duration: 6000 }); })
              .catch(e => toast.error(`Daily stats not saved: ${e?.message || e}`));
      }
  };

  const processOperationalMemo = (pasted: string) =>
      runImport('pasted Memo', () => applyMemo(masterList, parseMemo(parseDelimited(pasted, '\t'), selectedDate), selectedDate));

  const changeDate = (days: number) => {
      const [year, month, day] = selectedDate.split('-').map(Number);
      const d = new Date(year, month - 1, day + days);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dy = String(d.getDate()).padStart(2, '0');
      setSelectedDate(`${y}-${m}-${dy}`);
  };

  const sarongHomeArea = (v: number): 'jettyA' | 'jettyB' | 'jettyC' | 'beach' =>
      v >= 1 && v <= 35 ? 'jettyA' : v >= 37 && v <= 50 ? 'jettyB' : v >= 59 && v <= 79 ? 'jettyC' : 'beach';
  const beachVAs = sarongVAs.map(va => ({ ...va, beach: va.villas.filter(v => sarongHomeArea(v) === 'beach') })).filter(va => va.beach.length);
  const sarongJettyB = beachVAs.filter(va => sarongHosts.includes(va.id)).flatMap(va => va.beach).sort((a, b) => a - b).map(String);
  const sarongAreaOf = (v: number) => (sarongHomeArea(v) === 'beach' && sarongJettyB.includes(String(v)) ? 'jettyB' : sarongHomeArea(v));

  const getSarongCounts = () => {
      let counts = {
          jettyA: { villas: 0, male: 0, female: 0, kids: 0 },
          jettyB: { villas: 0, male: 0, female: 0, kids: 0 },
          jettyC: { villas: 0, male: 0, female: 0, kids: 0 },
          beach:  { villas: 0, male: 0, female: 0, kids: 0 },
          total:  { villas: 0, male: 0, female: 0, kids: 0 }
      };

      (sarongRows.length ? sarongRows : masterList).forEach(rec => {
          const st = String(rec?.status || 'VAC').toUpperCase();
          if (st === 'VAC' || (st.includes('DEP') && !st.includes('ARR'))) return;
          if (st === 'VM/VAC') return;
          if (st.includes('TMA')) return;
          if (st === 'SHOW VILLA' || st === 'FUMIGATION') return;
          // Day use = departing guest waiting for late check-out: leaving, so no sarong
          if (st === 'DAY USE' || st === 'VM/DU') return;
          
          const gUpper = String(rec?.guest_name || '').toUpperCase();
          if (gUpper && (gUpper.includes('HOUSE USE') || gUpper.includes('H/U') || st === 'HOUSE USE')) return;

          const v = parseInt(rec.villa_number, 10);
          if (isNaN(v)) return;

          const area = sarongAreaOf(v);

          let adults = rec.pax_adults || 0;
          let kids = rec.pax_kids || 0;

          let male = 0;
          let female = 0;

          // Adults by title. A name with an age "(5 yrs)" or a child title (Mstr / Master / Kokko) is a child:
          // children are counted from pax_kids, never as Black / Maroon.
          let girlsTitledMiss = 0;
          gUpper.split('&').map(n => n.trim()).filter(Boolean).forEach(n => {
              const isChild = /\(\s*\d+\s*(YRS?|MTHS?)\s*\)/.test(n) || /^(MSTR|MASTER|KOKKO)\b/.test(n);
              if (isChild) return;
              if (/^(MR|ALFAALIL)\b/.test(n)) male += 1;
              else if (/^(MS|MRS|MME|ALFAALILA)\b/.test(n)) female += 1;
              else if (/^MISS\b/.test(n)) { female += 1; girlsTitledMiss += 1; }
          });
          // More titled adults than booked adults: a "Miss" without an age is most likely a child
          while (male + female > adults && girlsTitledMiss > 0 && adults > 0) { female -= 1; girlsTitledMiss -= 1; }

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

  // Sarong colours: Black = adult men, Maroon = adult women, Kids
  const SARONG_KINDS = [
      { key: 'male', label: 'Black', sub: 'Men', chip: 'bg-slate-900', ring: 'ring-slate-900/10' },
      { key: 'female', label: 'Maroon', sub: 'Women', chip: 'bg-[#7A1F3D]', ring: 'ring-[#7A1F3D]/15' },
      { key: 'kids', label: 'Kids', sub: 'Children', chip: 'bg-amber-400', ring: 'ring-amber-400/30' },
  ] as const;

  const renderSarongArea = (title: string, range: string, data: any) => (
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-baseline justify-between gap-2 mb-3">
              <div className="min-w-0">
                  <h4 className="font-black text-sm text-slate-800 truncate">{title}</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{range}</p>
              </div>
              <span className="shrink-0 text-[10px] font-black text-slate-500 bg-slate-100 px-2 py-1 rounded-full">{data.villas} villas</span>
          </div>
          <div className="space-y-1.5">
              {SARONG_KINDS.map(k => (
                  <div key={k.key} className="flex items-center gap-2.5">
                      <span className={`w-3 h-3 rounded-full ${k.chip} ring-4 ${k.ring} shrink-0`} />
                      <span className="text-xs font-bold text-slate-500 flex-1">{k.label}</span>
                      <span className={`text-lg font-black tabular-nums ${data[k.key] ? 'text-slate-800' : 'text-slate-300'}`}>{data[k.key]}</span>
                  </div>
              ))}
          </div>
      </div>
  );

  const getStatusColor = (s: string) => {
      const st = String(s || 'VAC').toUpperCase();
      if(st === 'HOUSE USE' || st === 'SHOW VILLA') return 'text-fuchsia-700 bg-fuchsia-100 border border-fuchsia-200';
      if(st === 'VM/VAC') return 'text-slate-500 bg-slate-200 border border-slate-300';
      if(st === 'VM/OCC') return 'text-indigo-700 bg-indigo-100 border border-indigo-200';
      if(st === 'VM/ARR') return 'text-blue-700 bg-blue-100 border border-blue-200';
      if(st === 'FUMIGATION') return 'text-teal-700 bg-teal-100 border border-teal-200';
      if(st === 'TMA (DAY)' || st === 'TMA DAY') return 'text-orange-700 bg-orange-100 border border-orange-200';
      if(st === 'TMA (NIGHT)' || st === 'TMA NIGHT') return 'text-purple-700 bg-purple-100 border border-purple-200';
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
              paxAdults += (r.pax_adults || 0);
              paxKids += (r.pax_kids || 0);
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
              const matchGuest = (row.guest_name || '').toLowerCase().includes(q) || (row.dep_guest_name || '').toLowerCase().includes(q);
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
                    <h1 className="text-xl font-black text-slate-800 tracking-tight"><span className="md:hidden">Guest List</span><span className="hidden md:inline">OPERA • Housekeeping Guest Management</span></h1>
                    <span className="hidden sm:inline text-[10px] font-black uppercase bg-[#6D2158]/10 text-[#6D2158] px-2 py-0.5 rounded-md">PMS Live</span>
                 </div>
                 <div className="flex flex-wrap items-center gap-2 mt-0.5">
                     <p className="text-xs text-slate-500 font-bold uppercase tracking-wide">
                        {new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-GB', { dateStyle: 'full' })}
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

                   <input key={`occ-${fileInputKey}`} type="file" id="fileOcc" className="hidden" accept=".xml" onChange={(e) => handleFileProcess(e, 'OCC')} />
                   <button onClick={() => document.getElementById('fileOcc')?.click()} className="hidden md:flex items-center gap-2 bg-white border border-slate-200 hover:border-emerald-600 text-slate-600 hover:text-emerald-700 px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer">
                      {isProcessing ? <Loader2 size={16} className="animate-spin"/> : <UploadCloud size={16}/>} <span>OCC XML</span>
                   </button>

                   <input key={`arr-${fileInputKey}`} type="file" id="fileXML" className="hidden" accept=".xml" onChange={(e) => handleFileProcess(e, 'ARRDEP_XML')} />
                   <button onClick={() => document.getElementById('fileXML')?.click()} className="hidden md:flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-600 hover:text-white px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer">
                      {isProcessing ? <Loader2 size={16} className="animate-spin"/> : <UploadCloud size={16}/>} <span>Arrivals XML</span>
                   </button>

                   <input key={`memo-${fileInputKey}`} type="file" id="fileMemo" className="hidden" accept=".csv" onChange={(e) => handleFileProcess(e, 'MEMO_CSV')} />
                   <button onClick={() => document.getElementById('fileMemo')?.click()} className="hidden md:flex items-center gap-2 bg-teal-50 border border-teal-200 text-teal-800 hover:bg-teal-600 hover:text-white px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer">
                      {isProcessing ? <Loader2 size={16} className="animate-spin"/> : <FileSpreadsheet size={16}/>} <span>Memo CSV</span>
                   </button>

                   <button onClick={() => setIsPasteModalOpen(true)} className="hidden md:flex items-center gap-2 bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-600 hover:text-white px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer">
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
                      {row.guest_name ? row.guest_name.split(' & ').map((name, idx) => {
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
                              <span className="text-xs font-bold text-slate-800 block">{row.dep_guest_name || 'No departing profile'}</span>
                              <div className="flex flex-wrap gap-2 text-[10px] font-mono text-rose-700 font-bold">
                                  {row.departure_time && <span>Dep Time: {row.departure_time}</span>}
                                  {row.dep_stay_dates && <span>Stay: {row.dep_stay_dates}</span>}
                              </div>
                          </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2 mt-2">
                          {(row.pax_adults > 0 || row.pax_kids > 0) && (
                              <div className="bg-slate-100 px-2 py-1 rounded-md flex items-center gap-1 text-[10px] font-bold text-slate-600">
                                  Pax: {row.pax_adults + row.pax_kids} {row.pax_kids > 0 && <span className="text-amber-500">({row.pax_kids} K)</span>}
                              </div>
                          )}
                          {row.meal_plan && <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md text-[10px] font-black uppercase">{row.meal_plan}</span>}
                          {row.gem_name && <span className="bg-purple-50 text-purple-700 px-2 py-1 rounded-md text-[10px] font-black uppercase">GEM: {row.gem_name}</span>}
                          {row.stay_dates && <span className="text-[10px] font-mono font-bold text-slate-400 border border-slate-200 px-2 py-1 rounded-md">{row.stay_dates}</span>}
                      </div>

                      {(row.arrival_time || (!isDepArr && row.departure_time)) && (
                          <div className="flex gap-3 mt-2 text-[10px] font-bold font-mono">
                              {row.arrival_time && <span className="text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">Arr: {row.arrival_time}</span>}
                              {!isDepArr && row.departure_time && <span className="text-rose-600 bg-rose-50 px-2 py-1 rounded border border-rose-100">Dep: {row.departure_time}</span>}
                          </div>
                      )}

                      {row.preferences && (<div className="flex items-center gap-1 mt-2 text-[10px] text-rose-500 font-bold bg-rose-50 p-2 rounded-lg border border-rose-100"><Heart size={12} fill="currentColor"/> Preferences Logged</div>)}
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
                        {row.guest_name ? row.guest_name.split(' & ').map((name, idx) => {
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
                                    <span className="font-bold text-slate-800">{row.dep_guest_name || 'No departing guest recorded'}</span>
                                </div>
                                <div className="font-mono font-bold text-rose-700 shrink-0">
                                    {row.departure_time ? `ETD: ${row.departure_time}` : ''} {row.dep_stay_dates ? `(${row.dep_stay_dates})` : ''}
                                </div>
                            </div>
                        )}

                        {row.preferences && (<div className="flex items-center gap-1 mt-0.5 text-[9px] text-rose-500 font-bold"><Heart size={8} fill="currentColor"/> Preferences Saved</div>)}
                    </div>
                  </td>
                  
                  <td className="py-2 px-4 text-center">
                      {(row.pax_adults > 0 || row.pax_kids > 0) && (
                          <div className="flex flex-col items-center">
                              <span className="text-[11px] font-black text-slate-700">{row.pax_adults + row.pax_kids}</span>
                              {row.pax_kids > 0 && <span className="text-[8px] font-bold text-amber-500 uppercase">{row.pax_kids} Kids</span>}
                          </div>
                      )}
                  </td>
                  <td className="py-2 px-4 text-[10px] font-bold text-slate-600 uppercase">{row.gem_name}</td>
                  <td className="py-2 px-4 text-[10px] text-slate-600 font-bold">{row.meal_plan}</td>
                  <td className="py-2 px-4 text-right text-[10px] font-mono font-bold text-slate-500">{row.stay_dates}</td>
                  <td className="py-2 px-4 text-right text-[10px] font-mono font-bold text-slate-600">
                      {row.arrival_time && <span className="block text-emerald-600">ETA: {row.arrival_time}</span>}
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

      {/* CHANGES REVIEW MODAL (WITH MEAL PLAN COLUMN) */}
      {diffModalOpen && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
              <div className="bg-slate-50 p-6 border-b border-slate-200 flex justify-between items-center">
                  <div>
                      <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        {changes.some(c => c.type === 'NOT IN HOUSE' || c.note) ? <AlertTriangle className="text-amber-500"/> : <CheckCircle className="text-emerald-500"/>}
                        Review Updates
                      </h3>
                      <p className="text-sm text-slate-500 mt-1">
                          {changes.length === 0 ? "The uploaded data matches the current database." : `${changes.length} villa${changes.length === 1 ? '' : 's'} change. Villas that stay the same are not listed.`}
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
                                  <th className="p-4">New Data & Meal Plan</th>
                                  <th className="p-4 w-12 text-right">Action</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                              {(changes.some(c => c.group) ? [...MEMO_GROUPS, ''] : [null]).flatMap(g => {
                                  // Memo upload: one heading per memo section (Arrival villas, Departure villas, ...)
                                  const items = changes.map((c, i) => ({ c, i })).filter(x => g === null || (x.c.group || '') === g);
                                  if (!items.length) return [];
                                  const head = g === null ? [] : [
                                      <tr key={`h-${g}`} className="bg-[#6D2158]/5">
                                          <td colSpan={6} className="px-4 py-2 text-[11px] font-black uppercase tracking-widest text-[#6D2158]">{g || 'Other'} <span className="text-slate-400">· {items.length}</span></td>
                                      </tr>,
                                  ];
                                  return [...head, ...items.map(({ c, i }) => {
                                  const pendingRec = pendingData.find(p => p.villa_number === c.villa);
                                  return (
                                      <tr key={i} className="hover:bg-slate-50">
                                          <td className="p-4 font-bold text-slate-700">{c.villa}</td>
                                          <td className="p-4">
                                              <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                                                  c.type === 'NOT IN HOUSE' ? 'bg-red-100 text-red-700 border border-red-300' :
                                                  c.type === 'ARRIVAL' ? 'bg-blue-100 text-blue-700' :
                                                  c.type === 'DEPARTURE' ? 'bg-rose-100 text-rose-800' :
                                                  c.type === 'DEP/ARR' ? 'bg-purple-100 text-purple-700' :
                                                  c.type === 'ROOM MOVE' || c.type === 'MOVED OUT' ? 'bg-indigo-100 text-indigo-800' :
                                                  c.type === 'NEW GUEST' ? 'bg-amber-100 text-amber-800' :
                                                  c.type === 'CREW' ? 'bg-orange-100 text-orange-800' :
                                                  c.type === 'EXTENDED' ? 'bg-teal-100 text-teal-800' :
                                                  'bg-slate-100 text-slate-600'
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
                                                              {['VAC','OCC','ARR','DEP','DEP/ARR','VM/VAC','VM/OCC','VM/ARR','TMA (Day)','TMA (Night)','DAY USE','HOUSE USE','SHOW VILLA','FUMIGATION'].map(s=><option key={s} value={s}>{s}</option>)}
                                                          </select>
                                                          <select 
                                                              className="p-1 border border-blue-200 bg-blue-50/50 text-blue-800 rounded text-[10px] font-black uppercase outline-none focus:border-blue-500"
                                                              value={pendingRec.meal_plan || ''}
                                                              onChange={(e) => updatePendingRecord(c.villa, 'meal_plan', e.target.value)}
                                                              title="Meal Plan"
                                                          >
                                                              <option value="">MP</option>
                                                              {MEAL_PLANS.map(mp => <option key={mp} value={mp}>{mp}</option>)}
                                                          </select>
                                                          <div className="text-xs leading-tight font-bold text-slate-700">{c.newGuest ? c.newGuest : 'Vacant'}</div>
                                                      </div>
                                                      {c.note && <div className="text-[11px] font-bold text-amber-700 flex items-center gap-1"><AlertTriangle size={12}/> {c.note}</div>}
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
                              })];
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
      {isSarongModalOpen && isAdmin && (() => {
          const sc = getSarongCounts();
          return (
          <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={() => setIsSarongModalOpen(false)}>
              <div className="bg-slate-50 w-full max-w-3xl rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                  {/* Header + island total */}
                  <div className="bg-[#6D2158] text-white px-5 pt-5 pb-6 shrink-0">
                      <div className="flex justify-between items-start gap-3">
                          <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">Tuesday</p>
                              <h3 className="text-xl font-black flex items-center gap-2"><Shirt size={20}/> Sarong Allocation</h3>
                              <p className="text-[11px] font-semibold text-white/60 mt-0.5">{new Date(`${sarongDate}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })} · {sc.total.villas} villas{sarongDate !== selectedDate ? ' · from that day’s list' : ''}</p>
                          </div>
                          <button onClick={() => setIsSarongModalOpen(false)} className="bg-white/10 p-2 rounded-full hover:bg-white/20 cursor-pointer" aria-label="Close"><X size={18}/></button>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-5">
                          {SARONG_KINDS.map(k => (
                              <div key={k.key} className="bg-white/10 rounded-2xl px-3 py-3 flex flex-col items-center">
                                  <span className={`w-6 h-6 rounded-full ${k.chip} ring-2 ring-white/70 shadow`} />
                                  <span className="text-3xl font-black tabular-nums mt-2 leading-none">{sc.total[k.key]}</span>
                                  <span className="text-[10px] font-black uppercase tracking-widest text-white/70 mt-1.5">{k.label}</span>
                                  <span className="text-[9px] font-semibold text-white/50">{k.sub}</span>
                              </div>
                          ))}
                      </div>
                  </div>

                  {/* Per area */}
                  <div className="overflow-y-auto p-4 sm:p-5">
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                          {renderSarongArea("Jetty A", "Villas 1–35", sc.jettyA)}
                          {renderSarongArea("Jetty B", sarongJettyB.length ? `37–50 + beach ${sarongJettyB.join(', ')}` : "Villas 37–50", sc.jettyB)}
                          {renderSarongArea("Jetty C", "Villas 59–79", sc.jettyC)}
                          {renderSarongArea("Beach", sarongJettyB.length ? "Beach (rest)" : "Beach villas", sc.beach)}
                      </div>

                      {/* Customise: beach villas served from the Jetty B pantry */}
                      <div className="mt-4 bg-white rounded-2xl border border-slate-200 p-4">
                          <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                  <p className="text-sm font-black text-slate-800">Jetty B pantry</p>
                                  <p className="text-[11px] font-semibold text-slate-400">{beachVAs.some(va => sarongHosts.includes(va.id)) ? `${beachVAs.filter(va => sarongHosts.includes(va.id)).map(va => va.name).join(', ')} — beach villas ${sarongJettyB.join(', ')} counted with Jetty B` : 'Pick the beach VAs who use the Jetty B pantry'}</p>
                              </div>
                              <button onClick={() => setSarongCustomise(c => !c)} className={`shrink-0 px-3 py-2 rounded-xl text-xs font-black cursor-pointer transition-colors ${sarongCustomise ? 'bg-slate-200 text-slate-600' : 'bg-[#6D2158] text-white hover:bg-[#5a1b49]'}`}>{sarongCustomise ? 'Close' : 'Customise'}</button>
                          </div>
                          {sarongCustomise && (
                              <div className="mt-3">
                                  {beachVAs.length === 0 ? (
                                      <p className="text-xs font-semibold text-slate-400 py-2">No villa attendant has beach villas in the allocation for {new Date(`${sarongDate}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short' })} yet.</p>
                                  ) : (
                                      <div className="space-y-1.5">
                                          {beachVAs.map(va => {
                                              const on = sarongHosts.includes(va.id);
                                              return (
                                                  <button key={va.id} onClick={() => setSarongHosts(l => on ? l.filter(x => x !== va.id) : [...l, va.id])}
                                                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 text-left cursor-pointer transition-colors ${on ? 'bg-[#6D2158]/5 border-[#6D2158]' : 'bg-white border-slate-100 hover:border-slate-200'}`}>
                                                      <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${on ? 'bg-[#6D2158] border-[#6D2158] text-white' : 'border-slate-300'}`}>{on && <Check size={12} strokeWidth={4}/>}</span>
                                                      <span className="min-w-0 flex-1">
                                                          <span className="block text-sm font-black text-slate-800 truncate">{va.name}</span>
                                                          <span className="block text-[11px] font-semibold text-slate-400 truncate">Beach villas {va.beach.join(', ')}</span>
                                                      </span>
                                                      <span className={`shrink-0 text-[10px] font-black uppercase tracking-wider ${on ? 'text-[#6D2158]' : 'text-slate-300'}`}>{on ? 'Jetty B' : 'Beach'}</span>
                                                  </button>
                                              );
                                          })}
                                      </div>
                                  )}
                                  {sarongAllocDate && sarongAllocDate !== sarongDate && (
                                      <p className="mt-2 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">No allocation for {new Date(`${sarongDate}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short' })} yet — showing {new Date(`${sarongAllocDate}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short' })}. Open this again once Tuesday is allocated.</p>
                                  )}
                                  <div className="flex items-center justify-between gap-2 mt-3">
                                      <p className="text-[10px] font-semibold text-slate-400">Ticked VAs use the Jetty B pantry: their beach villas are counted with Jetty B. Remembered for the next weeks.</p>
                                      <button onClick={() => saveSarongJettyB(sarongHosts)} disabled={sarongSaving} className="shrink-0 px-4 py-2 rounded-xl text-xs font-black bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer">{sarongSaving ? 'Saving…' : 'Save'}</button>
                                  </div>
                              </div>
                          )}
                      </div>
                      <p className="text-[11px] font-semibold text-slate-400 mt-4 leading-relaxed">
                          Not counted: departures, day use, TMA, house use, show villas and fumigation. Back-to-back counts the arriving guest; a villa move counts in the new villa.
                      </p>
                  </div>
              </div>
          </div>
          );
      })()}

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
                                        setLinkedSuitesSelection(getCurrentlyLinked(v, editingRecord.stay_id));
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
                                    {['VAC','OCC','ARR','DEP','DEP/ARR','VM/VAC','VM/OCC','VM/ARR','TMA (Day)','TMA (Night)','DAY USE','HOUSE USE','SHOW VILLA','FUMIGATION'].map(s=><option key={s} value={s}>{s}</option>)}
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
                                    {MEAL_PLANS.map(mp => <option key={mp} value={mp}>{mp}</option>)}
                                    {editingRecord.meal_plan && !MEAL_PLANS.includes(editingRecord.meal_plan) && (
                                        <option value={editingRecord.meal_plan}>{editingRecord.meal_plan}</option>
                                    )}
                                </select>
                            </div>
                        </div>

                        {/* IN-FOLIO EXTENSION / LINKED VILLAS SELECTOR — only 57 (→56/58) and 87 (→88) */}
                        {getAssociatedVillas(editingRecord.villa_number).length > 0 && (
                        <div className="bg-purple-50/70 p-3.5 rounded-2xl border border-purple-100 space-y-2.5">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black text-[#6D2158] uppercase tracking-wider flex items-center gap-1.5">
                                    <Link2 size={13}/> Link Connected Villa
                                </span>
                                <span className="text-[9px] text-slate-400 font-bold">Extension of V{editingRecord.villa_number}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {getAssociatedVillas(editingRecord.villa_number).map(suite => {
                                    const isLinked = linkedSuitesSelection.includes(suite);
                                    const suiteRec = masterList.find(r => r.villa_number === suite);
                                    const hasOwnGuest = !!suiteRec?.guest_name && ACTIVE_STATUSES.includes(suiteRec.status) && suiteRec.stay_id !== editingRecord.stay_id;
                                    return (
                                        <button
                                            key={suite}
                                            type="button"
                                            disabled={hasOwnGuest}
                                            title={hasOwnGuest ? `Occupied by ${suiteRec?.guest_name}` : undefined}
                                            onClick={() => toggleLinkedSuite(suite)}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-black border transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                                isLinked
                                                    ? 'bg-[#6D2158] text-white border-[#6D2158] shadow-xs'
                                                    : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300'
                                            }`}
                                        >
                                            {isLinked ? `✓ Villa ${suite}` : `+ Villa ${suite}`}{hasOwnGuest ? ' (occupied)' : ''}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        )}

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
                                value={editingRecord.guest_name || ''} 
                                onChange={e => setEditingRecord({...editingRecord, guest_name: e.target.value})}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-3">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Arrival Time (ETA)</label>
                                <input 
                                    type="time" 
                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-emerald-700 text-center outline-none" 
                                    value={editingRecord.arrival_time || ''} 
                                    onChange={e => setEditingRecord({...editingRecord, arrival_time: e.target.value})}
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
                                    value={editingRecord.pax_adults || 0} 
                                    onChange={e => setEditingRecord({...editingRecord, pax_adults: parseInt(e.target.value, 10) || 0})}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Kids</label>
                                <input 
                                    type="number" 
                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-center text-slate-700 outline-none" 
                                    value={editingRecord.pax_kids || 0} 
                                    onChange={e => setEditingRecord({...editingRecord, pax_kids: parseInt(e.target.value, 10) || 0})}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Stay Dates</label>
                                <input 
                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-center text-slate-700 outline-none" 
                                    placeholder="DD/MM - DD/MM"
                                    value={editingRecord.stay_dates || ''} 
                                    onChange={e => setEditingRecord({...editingRecord, stay_dates: e.target.value})}
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
                            value={editingRecord.preferences || ''} 
                            onChange={e => setEditingRecord({...editingRecord, preferences: e.target.value})}
                         />
                     </div>
                 ) : (
                     <div className="space-y-4">
                         <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-3">
                             <span className="text-[10px] font-black uppercase text-rose-700 tracking-wider block">
                                 Departing Guest Folio (Checking Out Today)
                             </span>
                             <div>
                                 <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Departing Guest Name</label>
                                 <input 
                                    className="w-full p-2.5 bg-white border border-rose-200 rounded-xl text-xs font-bold text-slate-800 outline-none" 
                                    value={editingRecord.dep_guest_name || ''} 
                                    onChange={e => setEditingRecord({...editingRecord, dep_guest_name: e.target.value})}
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
                                        value={editingRecord.dep_stay_dates || ''} 
                                        onChange={e => setEditingRecord({...editingRecord, dep_stay_dates: e.target.value})}
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
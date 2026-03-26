"use client";
import React, { useState, useEffect } from 'react';
import { 
  Edit3, X, ChevronLeft, ChevronRight,
  FileSpreadsheet, Heart, ArrowRight, AlertTriangle, CheckCircle, Loader2, RotateCw, UploadCloud, User, Baby, ArrowRightLeft, Clock,
  Shirt, Trash2, Info
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

const TOTAL_VILLAS = 97;

const getToday = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
    const upperM = mStr.toUpperCase();
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

// --- GUEST TRACKING & ALLOCATION ENGINE ---
const cleanNameForMatch = (n: string) => n.toLowerCase().replace(/\b(mr|ms|mrs|miss|mstr|alfaalil|alfaalila|kokko|yrs)\b/g, '').replace(/[^a-z]/g, '');

const isSameGuest = (n1: string, n2: string) => {
    if (!n1 || !n2) return false;
    const c1 = cleanNameForMatch(n1);
    const c2 = cleanNameForMatch(n2);
    if (c1.length < 5 || c2.length < 5) return false;
    return c1.includes(c2.substring(0, 10)) || c2.includes(c1.substring(0, 10));
};

type GuestRecord = {
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
  
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [changes, setChanges] = useState<ChangeLog[]>([]);
  const [pendingData, setPendingData] = useState<GuestRecord[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRollingOver, setIsRollingOver] = useState(false);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<GuestRecord | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'prefs'>('details');

  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [moveData, setMoveData] = useState({ from: '', to: '', type: 'VM/OCC' });

  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pastedText, setPastedText] = useState('');
  
  const [isSarongModalOpen, setIsSarongModalOpen] = useState(false);

  // --- NEW: Custom Confirm Dialog State ---
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
        const parsed = JSON.parse(sessionData);
        setIsAdmin(parsed.system_role === 'admin');
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
                setLastSyncTime(new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit' }));
            }
        })
        .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedDate]);

  const fetchDailyData = async (showLoading = true) => {
    if (showLoading) setIsProcessing(true);
    const { data: dbRecords, error } = await supabase
      .from('hsk_daily_summary')
      .select('*')
      .eq('report_date', selectedDate);

    if (error) console.error(error);

    const fullList: GuestRecord[] = [];
    for (let i = 1; i <= TOTAL_VILLAS; i++) {
      const villaNum = i.toString();
      const match = dbRecords?.find(r => normalizeVilla(r.villa_number) === villaNum);
      if (match) {
        fullList.push({ ...match, villa_number: villaNum });
      } else {
        fullList.push({
          report_date: selectedDate, villa_number: villaNum, status: 'VAC', guest_name: '',
          pax_adults: 0, pax_kids: 0, gem_name: '', meal_plan: '', stay_dates: '', remarks: '',
          preferences: '', arrival_time: '', departure_time: '', stay_id: ''
        });
      }
    }
    fullList.sort((a, b) => parseInt(a.villa_number) - parseInt(b.villa_number));
    setMasterList(fullList);

    if (dbRecords && dbRecords.length > 0) {
        let maxTime = 0;
        for (const r of dbRecords) {
            const t = new Date(r.updated_at || r.created_at || 0).getTime();
            if (t > maxTime) maxTime = t;
        }
        if (maxTime > 0) {
            setLastSyncTime(new Date(maxTime).toLocaleTimeString('en-US', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit' }));
        } else {
            setLastSyncTime('');
        }
    } else {
        setLastSyncTime('');
    }

    if (showLoading) setIsProcessing(false);
  };

  const handleSaveEdit = async () => {
    if (!editingRecord) return;
    setIsProcessing(true);
    
    let finalPayload = { ...editingRecord };
    if (!finalPayload.stay_id && finalPayload.stay_dates) {
        const arrStr = finalPayload.stay_dates.split('-')[0].trim().replace(/\//g, '');
        finalPayload.stay_id = `${finalPayload.villa_number}_${arrStr}`;
    }
    
    const { id, ...payload } = finalPayload;
    
    const { error } = id 
        ? await supabase.from('hsk_daily_summary').update(payload).eq('id', id) 
        : await supabase.from('hsk_daily_summary').insert(payload);
        
    if (!error) { 
        setIsEditOpen(false); 
        fetchDailyData(); 
        setEditingRecord(null);
        toast.success("Profile Saved!");
    } else {
        toast.error("Error saving record: " + error.message);
    }
    setIsProcessing(false);
  };

  const handleCloneToConnected = (baseVilla: string) => {
      if (!editingRecord) return;
      const targetVillas = baseVilla === '87' ? ['88'] : ['56', '58'];
      
      setConfirmDialog({
          isOpen: true,
          title: "Clone Guest Profile",
          message: `Clone this guest profile to connected Villa(s) ${targetVillas.join(', ')}?`,
          confirmText: "Clone",
          confirmColor: "bg-indigo-600 hover:bg-indigo-700",
          onConfirm: async () => {
              setConfirmDialog(null);
              setIsProcessing(true);
              for (const v of targetVillas) {
                  const targetRec = masterList.find(r => r.villa_number === v);
                  if (targetRec) {
                      const payload = { ...editingRecord, id: targetRec.id, villa_number: v };
                      if (targetRec.id) await supabase.from('hsk_daily_summary').update(payload).eq('id', targetRec.id);
                      else await supabase.from('hsk_daily_summary').insert(payload);
                  }
              }
              setIsProcessing(false);
              fetchDailyData();
              toast.success(`Guest cloned to ${targetVillas.join(', ')}`);
          }
      });
  };

  const handleApproveUpdate = async () => {
      setIsProcessing(true);
      await supabase.from('hsk_daily_summary').delete().eq('report_date', selectedDate);
      const payload = pendingData.map(r => { 
          const { id, ...rest } = r; 
          return { ...rest, report_date: selectedDate, arrival_time: rest.arrival_time || '', departure_time: rest.departure_time || '' };
      });
      await supabase.from('hsk_daily_summary').insert(payload);
      fetchDailyData();
      setDiffModalOpen(false);
      setIsProcessing(false);
      toast.success("Summary synchronized successfully.");
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
      if (!moveData.from || !moveData.to) return toast.error("Please specify both villas.");
      
      const fromRec = masterList.find(r => r.villa_number === moveData.from);
      const toRec = masterList.find(r => r.villa_number === moveData.to);
      
      if (!fromRec || !toRec) return toast.error("Invalid villa numbers.");

      setIsProcessing(true);

      const toPayload = {
          ...toRec,
          status: moveData.type,
          guest_name: fromRec.guest_name,
          pax_adults: fromRec.pax_adults,
          pax_kids: fromRec.pax_kids,
          gem_name: fromRec.gem_name,
          meal_plan: fromRec.meal_plan,
          stay_dates: fromRec.stay_dates,
          preferences: fromRec.preferences,
          stay_id: fromRec.stay_id,
          arrival_time: fromRec.arrival_time,
          departure_time: fromRec.departure_time
      };

      const fromPayload = {
          ...fromRec,
          status: 'VM/VAC',
      };

      if (toRec.id) await supabase.from('hsk_daily_summary').update(toPayload).eq('id', toRec.id);
      else await supabase.from('hsk_daily_summary').insert(toPayload);

      if (fromRec.id) await supabase.from('hsk_daily_summary').update(fromPayload).eq('id', fromRec.id);
      else await supabase.from('hsk_daily_summary').insert(fromPayload);

      setIsMoveModalOpen(false);
      setMoveData({ from: '', to: '', type: 'VM/OCC' });
      fetchDailyData();
      setIsProcessing(false);
      toast.success(`Moved Guest from ${moveData.from} to ${moveData.to}`);

      // RETROSPECTIVE MOVE PROMPT
      if (selectedDate < getToday()) {
          setConfirmDialog({
              isOpen: true,
              title: "Apply Move to Today?",
              message: `This move was recorded for a past date (${selectedDate}). Do you want to apply this move to TODAY (${getToday()}) as well?`,
              confirmText: "Apply to Today",
              confirmColor: "bg-[#6D2158] hover:bg-[#5a1b49]",
              onConfirm: async () => {
                  setConfirmDialog(null);
                  const { data: todayData } = await supabase.from('hsk_daily_summary').select('*').eq('report_date', getToday()).in('villa_number', [moveData.from, moveData.to]);
                  const todayFrom = todayData?.find(r => r.villa_number === moveData.from);
                  const todayTo = todayData?.find(r => r.villa_number === moveData.to);
                  
                  // For today, the destination is just OCC. The source is entirely VAC.
                  const todayToPayload = { 
                      ...toPayload, 
                      report_date: getToday(),
                      status: 'OCC'
                  };
                  delete todayToPayload.id;
                  
                  const todayFromPayload = { 
                      ...fromPayload, 
                      report_date: getToday(),
                      status: 'VAC',
                      guest_name: '', pax_adults: 0, pax_kids: 0, meal_plan: '', stay_dates: '', preferences: '', gem_name: '', stay_id: '', arrival_time: '', departure_time: ''
                  };
                  delete todayFromPayload.id;

                  if (todayTo) await supabase.from('hsk_daily_summary').update(todayToPayload).eq('id', todayTo.id);
                  else await supabase.from('hsk_daily_summary').insert(todayToPayload);

                  if (todayFrom) await supabase.from('hsk_daily_summary').update(todayFromPayload).eq('id', todayFrom.id);
                  else await supabase.from('hsk_daily_summary').insert(todayFromPayload);
                  
                  toast.success("Applied to today's list as well.");
              }
          });
      }
  };

  const handlePasteSubmit = () => {
      if (!pastedText.trim()) {
          toast.error("Please paste some data first.");
          return;
      }
      setIsProcessing(true);
      setIsPasteModalOpen(false);
      
      const rows = pastedText.split('\n').map(row => row.split('\t'));
      processOperationalMemo(rows);
      setPastedText(''); 
  };

  const handleFileProcess = (e: React.ChangeEvent<HTMLInputElement>, type: 'ARRDEP_XML' | 'OCC') => {
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
              }
          } catch (err) {
              toast.error("Error parsing the file. Please ensure it is the correct export format.");
              setIsProcessing(false);
          }
          e.target.value = '';
          setFileInputKey(prev => prev + 1);
      };

      if (type === 'OCC' || type === 'ARRDEP_XML') {
          reader.readAsText(file);
      }
  };

  const processOCCXML = (xmlText: string) => {
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
                  stayId = `${cleanVilla}_${aParts[2]}${aMonth}${aParts[0].padStart(2, '0')}`; 
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

          const oldStatus = record.status;
          if (!oldStatus.includes('ARR') && !oldStatus.includes('DEP')) record.status = 'OCC';
          
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
              if (oldVillaMatch.preferences) record.preferences = oldVillaMatch.preferences;

              diffs.push({
                  villa: newOcc.villa, type: 'ALLOC CHANGE',
                  oldGuest: oldStatus === 'VAC' ? 'Vacant' : record.guest_name,
                  newGuest: `${newOcc.names} (Moved from V${oldVillaMatch.villa_number})`,
                  oldStatus: oldStatus, newStatus: record.status
              });
          } else {
              record.gem_name = newOcc.gemName;
              diffs.push({
                  villa: newOcc.villa, type: 'SYNC',
                  oldGuest: oldStatus === 'VAC' ? 'Vacant' : record.guest_name,
                  newGuest: record.guest_name, oldStatus: oldStatus, newStatus: record.status
              });
          }
      });

      currentMap.forEach((rec, vNum) => {
          const inOCC = newOccList.find(n => n.villa === vNum);
          const isTMA = rec.status.toUpperCase().includes('TMA');
          const isHouseUse = rec.guest_name.toUpperCase().includes('HOUSE USE') || rec.guest_name.toUpperCase().includes('H/U') || rec.status.toUpperCase().includes('HOUSE');

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
                          newGuest: 'Not in OCC List! (No Show / Early C/O?)',
                          oldStatus: rec.status, newStatus: 'VAC'
                      });
                  }
                  
                  rec.status = 'VAC'; rec.guest_name = ''; rec.pax_adults = 0; rec.pax_kids = 0;
                  rec.meal_plan = ''; rec.stay_dates = ''; rec.preferences = ''; rec.gem_name = ''; rec.stay_id = '';
              }
          }
      });

      setChanges(diffs);
      setPendingData(Array.from(currentMap.values()));
      setDiffModalOpen(true);
      setIsProcessing(false);
  };

  const processArrDepXML = (xmlText: string) => {
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
          
          const record = currentMap.get(cleanVilla)!;

          let isArr = false; let isDep = false;
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
          else if (isDep) finalStatus = 'DEP';
          else if (resList.some(r => getText(r, 'SHORT_RESV_STATUS').includes('CKOT'))) finalStatus = 'VAC';

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
                      stayId = `${cleanVilla}_${aParts[2]}${aMonth}${aParts[0].padStart(2, '0')}`; 
                  }
              }

              mealPlan = '';

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
          let oldVillaMatch: GuestRecord | null = null;
          let isStayExt = newArr.isB2B;

          if (!isSameGuest(record.guest_name, newArr.names)) {
              for (const [vNum, rec] of currentMap.entries()) {
                  if (vNum !== newArr.villa && ['OCC', 'ARR', 'DEP/ARR', 'VM/OCC', 'VM/ARR'].includes(rec.status)) {
                      if (isSameGuest(rec.guest_name, newArr.names)) {
                          oldVillaMatch = rec;
                          break;
                      }
                  }
              }
          } else {
              if (['OCC', 'VM/OCC'].includes(record.status) && newArr.status.includes('ARR')) {
                  isStayExt = true;
              }
          }

          const oldStatus = record.status;
          let newStatus = newArr.status;
          
          if (newStatus === 'ARR' && oldStatus.includes('DEP')) newStatus = 'DEP/ARR';

          let finalNames = newArr.names;
          let finalAdults = newArr.adults;
          let finalKids = newArr.kids;
          let isJoiner = false;

          if (isStayExt) {
              newStatus = oldStatus.includes('VM/') ? oldStatus : 'OCC'; 
          } else if (['OCC', 'VM/OCC'].includes(oldStatus) && newStatus.includes('ARR')) {
              if (record.guest_name && !isSameGuest(record.guest_name, newArr.names)) {
                  finalNames = `${record.guest_name} & ${newArr.names}`;
                  finalAdults = record.pax_adults + newArr.adults;
                  finalKids = record.pax_kids + newArr.kids;
                  isJoiner = true;
              }
          }

          record.guest_name = finalNames;
          record.pax_adults = finalAdults;
          record.pax_kids = finalKids;
          record.meal_plan = newArr.mealPlan;
          record.stay_dates = newArr.stayDates;
          record.status = newStatus;
          record.stay_id = newArr.stayId;
          
          if (newArr.prefs) {
              record.preferences = record.preferences ? `${record.preferences}\n\n${newArr.prefs}` : newArr.prefs;
          }

          if (oldVillaMatch) {
              if (oldVillaMatch.gem_name) record.gem_name = oldVillaMatch.gem_name;
              if (oldVillaMatch.arrival_time) record.arrival_time = oldVillaMatch.arrival_time;
              if (oldVillaMatch.departure_time) record.departure_time = oldVillaMatch.departure_time;
              if (oldVillaMatch.preferences && !newArr.prefs) record.preferences = oldVillaMatch.preferences;

              diffs.push({
                  villa: newArr.villa, type: 'ALLOC CHANGE',
                  oldGuest: oldStatus === 'VAC' ? 'Vacant' : record.guest_name,
                  newGuest: `${finalNames} (Moved from V${oldVillaMatch.villa_number})`,
                  oldStatus: oldStatus, newStatus: record.status
              });
          } else {
              let diffType = 'SYNC';
              if (isStayExt) diffType = 'STAY EXT';
              else if (isJoiner) diffType = 'JOINER (ARR)';
              else if (newStatus === 'DEP/ARR' && !oldStatus.includes('ARR')) diffType = 'DEP/ARR';
              else if (newStatus.includes('ARR') && !oldStatus.includes('ARR')) diffType = 'ARRIVAL';
              else if (newStatus.includes('DEP') && !oldStatus.includes('DEP')) diffType = 'DEPARTURE';

              diffs.push({
                  villa: newArr.villa, type: diffType,
                  oldGuest: oldStatus === 'VAC' ? 'Vacant' : (isJoiner ? record.guest_name : record.guest_name),
                  newGuest: finalNames, oldStatus: oldStatus, newStatus: record.status
              });
          }
      });

      currentMap.forEach((rec, vNum) => {
          const inARR = newArrList.find(n => n.villa === vNum);

          if (!inARR) {
              const oldStatus = rec.status;
              if (oldStatus === 'ARR' || oldStatus === 'DEP/ARR') {
                  let newStatus = oldStatus === 'DEP/ARR' ? 'DEP' : 'VAC';
                  
                  const movedTo = newArrList.find(n => isSameGuest(n.names, rec.guest_name));
                  
                  if (movedTo) {
                      diffs.push({
                          villa: vNum, type: 'MOVED OUT',
                          oldGuest: rec.guest_name,
                          newGuest: `Moved to V${movedTo.villa}`,
                          oldStatus: oldStatus, newStatus: newStatus
                      });
                  } else {
                      diffs.push({
                          villa: vNum, type: 'CHANGE', 
                          oldGuest: rec.guest_name || 'Cancelled', newGuest: newStatus === 'VAC' ? 'Vacant' : 'Departing', 
                          oldStatus: oldStatus, newStatus: newStatus
                      });
                  }

                  rec.status = newStatus;
                  if (newStatus === 'VAC') {
                      rec.guest_name = ''; rec.pax_adults = 0; rec.pax_kids = 0;
                      rec.meal_plan = ''; rec.stay_dates = ''; rec.preferences = ''; rec.gem_name = ''; rec.stay_id = '';
                  }
              }
          }
      });

      setChanges(diffs);
      setPendingData(Array.from(currentMap.values()));
      setDiffModalOpen(true);
      setIsProcessing(false);
  };

  const processOperationalMemo = (rows: any[][]) => {
      const currentMap = new Map(masterList.map(r => [r.villa_number, { ...r }]));
      const diffs: ChangeLog[] = [];

      let isArrSection = false, isDepSection = false;
      
      for (let i = 0; i < rows.length; i++) {
          const row = rows[i] || [];
          if (row.length < 2) continue;
          const rowStr = row.map(c => String(c).toUpperCase()).join(' ');

          if (rowStr.includes('ARRIVALS') && !rowStr.includes('VS')) { isArrSection = true; isDepSection = false; continue; }
          if (rowStr.includes('DEPARTURES')) { isArrSection = false; isDepSection = true; continue; }
          if (rowStr.includes('ROOM MOVES')) break; 

          if (isArrSection) {
              let v = normalizeVilla(row[1]) || normalizeVilla(row[0]); 
              if (v && currentMap.has(v)) {
                  const record = currentMap.get(v)!;
                  const gemName = row[9] ? String(row[9]).split('\n')[0] : null; 
                  const arrTimeRaw = String(row[4] || '') + " " + String(row[5] || '') + " " + String(row[3] || ''); 

                  let isTMA = rowStr.includes('8Q') || rowStr.includes('TMA') || rowStr.includes('SHUT') || rowStr.includes('E\nA\nP');
                  let madeChange = false;

                  if (isTMA && !record.status.includes('TMA')) {
                      record.status = 'TMA (Day)';
                      madeChange = true;
                  }
                  if (gemName && gemName.length > 1 && !gemName.includes(',')) {
                      record.gem_name = gemName.trim();
                      madeChange = true;
                  }
                  const t = extractTime(arrTimeRaw);
                  if (t && record.arrival_time !== t) {
                      record.arrival_time = t;
                      madeChange = true;
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
          toast.success("No new operational times found.");
          setIsProcessing(false);
          return;
      }

      setChanges(diffs);
      setPendingData(Array.from(currentMap.values()));
      setDiffModalOpen(true);
      setIsProcessing(false);
  };

  const handleRollOver = () => {
      setConfirmDialog({
          isOpen: true,
          title: "Confirm Rollover",
          message: `Overwrite ${selectedDate} with previous day's data?`,
          confirmText: "Yes, Roll Over",
          confirmColor: "bg-amber-500 hover:bg-amber-600",
          onConfirm: async () => {
              setConfirmDialog(null);
              setIsRollingOver(true);
              const { data: recentRecords } = await supabase.from('hsk_daily_summary').select('*').lt('report_date', selectedDate).order('report_date', { ascending: false }).limit(200);
              if (!recentRecords || recentRecords.length === 0) { toast.error("No history found."); setIsRollingOver(false); return; }
              const lastDate = recentRecords[0].report_date;
              const sourceData = recentRecords.filter(r => r.report_date === lastDate);
              
              const newDayData = sourceData.map(r => {
                  let newStatus = 'VAC';
                  let keepDetails = false;
                  
                  if (['OCC', 'ARR', 'DEP/ARR', 'VM/OCC', 'VM/ARR'].includes(r.status)) {
                      let departingToday = false;
                      if (r.stay_dates) {
                          const parts = r.stay_dates.split('-');
                          if (parts.length === 2) {
                              const depDateStr = parts[1].trim(); 
                              const [selYear, selMonth, selDay] = selectedDate.split('-');
                              if (depDateStr === `${selDay}/${selMonth}`) {
                                  departingToday = true;
                              }
                          }
                      }
                      newStatus = departingToday ? 'DEP' : 'OCC';
                      keepDetails = true;
                  } 
                  else if (['DEP', 'DAY USE', 'VM/VAC'].includes(r.status) || r.status.includes('TMA')) {
                      newStatus = 'VAC';
                      keepDetails = false;
                  }

                  return {
                      report_date: selectedDate, villa_number: r.villa_number, status: newStatus, 
                      guest_name: keepDetails ? r.guest_name : '',
                      pax_adults: keepDetails ? r.pax_adults : 0, 
                      pax_kids: keepDetails ? r.pax_kids : 0, 
                      gem_name: keepDetails ? r.gem_name : '', 
                      meal_plan: keepDetails ? r.meal_plan : '', 
                      stay_dates: keepDetails ? r.stay_dates : '',
                      remarks: '', 
                      preferences: keepDetails ? r.preferences : '', 
                      arrival_time: '', 
                      departure_time: '', 
                      stay_id: keepDetails ? r.stay_id : ''
                  };
              });

              await supabase.from('hsk_daily_summary').delete().eq('report_date', selectedDate);
              await supabase.from('hsk_daily_summary').insert(newDayData);
              fetchDailyData();
              setIsRollingOver(false);
              toast.success("Rollover Complete!");
          }
      });
  };

  // --- SARONG CALCULATOR ---
  const getSarongCounts = () => {
      let counts = {
          jettyA: { villas: 0, male: 0, female: 0, kids: 0 },
          jettyB: { villas: 0, male: 0, female: 0, kids: 0 },
          jettyC: { villas: 0, male: 0, female: 0, kids: 0 },
          beach:  { villas: 0, male: 0, female: 0, kids: 0 },
          total:  { villas: 0, male: 0, female: 0, kids: 0 }
      };

      masterList.forEach(rec => {
          // Ignore Departures completely (unless they are DEP/ARR, which holds the arrival guest info)
          if (rec.status === 'VAC' || (rec.status.includes('DEP') && !rec.status.includes('ARR'))) return;
          if (rec.status === 'VM/VAC') return;
          if (rec.status.includes('TMA')) return;
          if (rec.guest_name.toUpperCase().includes('HOUSE USE') || rec.guest_name.toUpperCase().includes('H/U') || rec.status === 'HOUSE USE') return;

          const v = parseInt(rec.villa_number, 10);
          if (isNaN(v)) return;

          let area: 'jettyA' | 'jettyB' | 'jettyC' | 'beach' = 'beach';
          if (v >= 1 && v <= 35) area = 'jettyA';
          else if (v >= 37 && v <= 50) area = 'jettyB';
          else if (v >= 59 && v <= 79) area = 'jettyC';

          let adults = rec.pax_adults || 0;
          let kids = rec.pax_kids || 0;

          let male = 0;
          let female = 0;

          // Intelligently guess gender based on titles in the string
          const nameStr = rec.guest_name.toUpperCase();
          const mrCount = (nameStr.match(/\bMR\b/g) || []).length;
          const msCount = (nameStr.match(/\b(MS|MRS|MISS|ALFAALILA)\b/g) || []).length;
          
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
      const st = s?.toUpperCase() || 'VAC';
      if(st === 'HOUSE USE' || st === 'SHOW VILLA') return 'text-fuchsia-700 bg-fuchsia-100 border border-fuchsia-200';
      if(st === 'VM/VAC') return 'text-slate-500 bg-slate-200 border border-slate-300';
      if(st === 'VM/OCC') return 'text-indigo-700 bg-indigo-100 border border-indigo-200';
      if(st === 'VM/ARR') return 'text-blue-700 bg-blue-100 border border-blue-200';
      if(st === 'TMA (DAY)') return 'text-orange-700 bg-orange-100 border border-orange-200';
      if(st === 'TMA (NIGHT)') return 'text-purple-700 bg-purple-100 border border-purple-200';
      if(st.includes('DEP') && st.includes('ARR')) return 'text-purple-700 bg-purple-50';
      if(st.includes('TMA')) return 'text-orange-700 bg-orange-50'; 
      if(st === 'DAY USE') return 'text-amber-700 bg-amber-50'; 
      if(st.includes('OCC')) return 'text-emerald-700 bg-emerald-50';
      if(st.includes('ARR')) return 'text-blue-700 bg-blue-50';
      if(st.includes('DEP')) return 'text-rose-700 bg-rose-50';
      return 'text-slate-300';
  };

  const changeDate = (days: number) => {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() + days);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dy = String(d.getDate()).padStart(2, '0');
      setSelectedDate(`${y}-${m}-${dy}`);
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 md:p-6 pb-32 font-sans text-slate-800">
      
      {/* HEADER */}
      <div className="flex flex-col xl:flex-row justify-between items-center mb-6 bg-white p-4 rounded-xl border border-slate-200 shadow-sm gap-4">
        <div className="flex items-center gap-4 w-full xl:w-auto justify-between">
           <div className="flex items-center gap-4">
               <div className="h-10 w-1 bg-[#6D2158] rounded-full shrink-0"></div>
               <div>
                 <h1 className="text-xl font-bold text-slate-800">Housekeeping Summary</h1>
                 <div className="flex items-center gap-2">
                     <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">
                        {new Date(selectedDate).toLocaleDateString('en-GB', { dateStyle: 'full' })}
                     </p>
                     {lastSyncTime && <span className="text-[9px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><Clock size={10}/> Last Update: {lastSyncTime}</span>}
                 </div>
               </div>
           </div>
        </div>
        
        <div className="flex flex-wrap items-center justify-end gap-2 w-full xl:w-auto">
           <div className="flex items-center bg-slate-100 rounded-lg p-0.5 mr-2">
              <button onClick={() => changeDate(-1)} className="p-2 hover:bg-white rounded-md text-slate-500 shadow-sm"><ChevronLeft size={16}/></button>
              <span className="px-4 text-xs font-bold text-slate-600 w-24 text-center">{new Date(selectedDate).toLocaleDateString('en-GB', {day:'2-digit', month:'short'})}</span>
              <button onClick={() => changeDate(1)} className="p-2 hover:bg-white rounded-md text-slate-500 shadow-sm"><ChevronRight size={16}/></button>
           </div>
           
           {isAdmin && (
               <>
                   <button onClick={handleRollOver} disabled={isRollingOver} className="flex items-center gap-2 bg-amber-50 border border-amber-100 text-amber-700 hover:bg-amber-100 px-3 py-2 rounded-lg text-xs font-bold transition-all">
                        {isRollingOver ? <Loader2 size={16} className="animate-spin"/> : <RotateCw size={16}/>} <span className="hidden sm:inline">Roll Over</span>
                   </button>

                   <input key={`occ-${fileInputKey}`} type="file" id="fileOcc" className="hidden" accept=".xml" onChange={(e) => handleFileProcess(e, 'OCC')} />
                   <button onClick={() => document.getElementById('fileOcc')?.click()} className="flex items-center gap-2 bg-white border border-slate-200 hover:border-emerald-600 text-slate-600 hover:text-emerald-700 px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-sm">
                      {isProcessing ? <Loader2 size={16} className="animate-spin"/> : <UploadCloud size={16}/>} <span className="hidden sm:inline">OCC Report</span>
                   </button>

                   <input key={`arr-${fileInputKey}`} type="file" id="fileXML" className="hidden" accept=".xml" onChange={(e) => handleFileProcess(e, 'ARRDEP_XML')} />
                   <button onClick={() => document.getElementById('fileXML')?.click()} className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-600 hover:text-white px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-sm">
                      {isProcessing ? <Loader2 size={16} className="animate-spin"/> : <UploadCloud size={16}/>} <span className="hidden sm:inline">Arrivals</span>
                   </button>

                   <button onClick={() => setIsPasteModalOpen(true)} className="flex items-center gap-2 bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-600 hover:text-white px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-sm">
                      <FileSpreadsheet size={16}/> <span className="hidden sm:inline">Paste Arr/Dep</span>
                   </button>

                   <button onClick={() => setIsSarongModalOpen(true)} className="flex items-center gap-2 bg-pink-600 text-white px-3 py-2 rounded-lg text-xs font-bold shadow-md hover:bg-pink-700 transition-all">
                      <Shirt size={16}/> <span className="hidden sm:inline">Sarongs</span>
                   </button>
               </>
           )}
        </div>
      </div>

      {/* MOBILE LIST VIEW */}
      <div className="md:hidden grid grid-cols-1 gap-4">
        {masterList.map((row) => {
            const isHouseUse = row.status === 'HOUSE USE' || row.guest_name.toUpperCase().includes('HOUSE USE');
            return (
          <div key={row.villa_number} onClick={() => { if(isAdmin){ setEditingRecord(row); setIsEditOpen(true); } }} className={`bg-white rounded-2xl p-4 shadow-sm border flex flex-col gap-3 relative ${row.status === 'VAC' ? 'border-slate-100 bg-slate-50/30' : 'border-slate-200 active:scale-[0.98] transition-transform cursor-pointer'} ${isHouseUse ? 'bg-fuchsia-50/30 border-fuchsia-100' : ''}`}>
              
              <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                     <span className="font-black text-2xl text-slate-800 tracking-tighter">V{row.villa_number}</span>
                     <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider shadow-sm ${getStatusColor(row.status)}`}>{row.status}</span>
                  </div>
                  
                  {isAdmin && (
                      <button onClick={(e) => { e.stopPropagation(); setMoveData({from: row.villa_number, to: '', type: 'VM/OCC'}); setIsMoveModalOpen(true); }} className="p-2 bg-slate-50 text-slate-400 rounded-lg shadow-sm active:bg-slate-100">
                         <ArrowRightLeft size={14}/>
                      </button>
                  )}
              </div>

              {row.status !== 'VAC' && (
                  <div className="flex flex-col gap-1.5 mt-1 border-t border-slate-100 pt-3">
                      
                      {row.guest_name ? row.guest_name.split(' & ').map((name, idx) => {
                          const isChild = name.includes('Mstr') || name.includes('Miss') || name.includes(' yrs)');
                          return (
                              <div key={idx} className="flex items-start gap-2">
                                  {isChild ? <Baby size={14} className="text-amber-500 mt-0.5 shrink-0"/> : <User size={14} className="text-slate-400 mt-0.5 shrink-0"/>}
                                  <span className="text-xs font-bold text-slate-700 leading-tight">{name.trim()}</span>
                              </div>
                          );
                      }) : <span className="text-xs font-bold text-slate-300 italic">- No Profile -</span>}

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

                      {(row.arrival_time || row.departure_time) && (
                          <div className="flex gap-3 mt-2 text-[10px] font-bold font-mono">
                              {row.arrival_time && <span className="text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">Arr: {row.arrival_time}</span>}
                              {row.departure_time && <span className="text-rose-600 bg-rose-50 px-2 py-1 rounded border border-rose-100">Dep: {row.departure_time}</span>}
                          </div>
                      )}

                      {row.preferences && (<div className="flex items-center gap-1 mt-2 text-[10px] text-rose-500 font-bold bg-rose-50 p-2 rounded-lg border border-rose-100"><Heart size={12} fill="currentColor"/> Preferences Logged</div>)}
                  </div>
              )}
          </div>
        )})}
      </div>

      {/* DESKTOP TABLE VIEW */}
      <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                <th className="py-3 px-4 w-28 sticky left-0 bg-slate-50 z-20 border-r border-slate-100">Villa</th>
                <th className="py-3 px-4 w-28">Status</th>
                <th className="py-3 px-4">Guest Profile</th>
                <th className="py-3 px-4 w-16 text-center">Pax</th>
                <th className="py-3 px-4 w-32">GEM</th>
                <th className="py-3 px-4 w-24">Meal</th>
                <th className="py-3 px-4 w-32 text-right">Dates</th>
                <th className="py-3 px-4 w-32 text-right">Time</th>
                <th className="py-3 px-4 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {masterList.map((row) => {
                  const isHouseUse = row.status === 'HOUSE USE' || row.guest_name.toUpperCase().includes('HOUSE USE');
                  return (
                <tr key={row.villa_number} className={`hover:bg-slate-50 transition-colors group ${row.status === 'VAC' ? 'bg-slate-50/30' : ''} ${isHouseUse ? 'bg-fuchsia-50/30' : ''}`}>
                  
                  <td className="py-2 px-4 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-50">
                      <div className="flex items-center gap-2">
                          <button onClick={() => { if(isAdmin){ setMoveData({from: row.villa_number, to: '', type: 'VM/OCC'}); setIsMoveModalOpen(true); } }} className="p-1.5 text-slate-300 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 rounded-md transition-colors opacity-100 lg:opacity-0 lg:group-hover:opacity-100" title="Move Villa">
                              <ArrowRightLeft size={12}/>
                          </button>
                          <span className="font-bold text-sm text-slate-700">{row.villa_number}</span>
                      </div>
                  </td>

                  <td className="py-2 px-4"><span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${getStatusColor(row.status)}`}>{row.status}</span></td>
                  
                  <td className="py-2 px-4 cursor-pointer" onClick={() => { if(isAdmin){ setEditingRecord(row); setIsEditOpen(true); } }}>
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
                                    <span className={`text-[11px] font-bold leading-tight transition-colors ${isAdmin ? 'group-hover:text-[#6D2158]' : ''} ${row.status === 'VAC' ? 'text-slate-300' : 'text-slate-700'}`}>
                                        {name.trim()}
                                    </span>
                                </div>
                            );
                        }) : (
                            <span className="text-xs font-bold text-slate-200">-</span>
                        )}
                        {row.preferences && (<div className="flex items-center gap-1 mt-1 text-[9px] text-rose-500 font-bold"><Heart size={8} fill="currentColor"/> Note</div>)}
                    </div>
                  </td>
                  
                  <td className="py-2 px-4 text-center">
                      {(row.pax_adults > 0 || row.pax_kids > 0) && (
                          <div className="flex flex-col items-center">
                              <span className="text-[11px] font-black text-slate-600">{row.pax_adults + row.pax_kids}</span>
                              {row.pax_kids > 0 && <span className="text-[8px] font-bold text-amber-500 uppercase">{row.pax_kids} Kids</span>}
                          </div>
                      )}
                  </td>
                  <td className="py-2 px-4 text-[10px] font-bold text-slate-500 uppercase">{row.gem_name}</td>
                  <td className="py-2 px-4 text-[10px] text-slate-500 font-medium">{row.meal_plan}</td>
                  <td className="py-2 px-4 text-right text-[10px] font-mono text-slate-400">{row.stay_dates}</td>
                  <td className="py-2 px-4 text-right text-[10px] font-mono text-slate-500">
                      {row.arrival_time && <span className="block text-emerald-600">Arr: {row.arrival_time}</span>}
                      {row.departure_time && <span className="block text-rose-600">Dep: {row.departure_time}</span>}
                  </td>
                  <td className="py-2 px-4 text-right">
                    {isAdmin && (
                        <button onClick={() => { setEditingRecord(row); setIsEditOpen(true); }} className="p-1.5 text-slate-300 hover:text-[#6D2158] hover:bg-[#6D2158]/10 rounded-lg transition-colors opacity-100 lg:opacity-0 lg:group-hover:opacity-100"><Edit3 size={14}/></button>
                    )}
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>

      {/* CHANGES MODAL */}
      {diffModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
              <div className="bg-slate-50 p-6 border-b border-slate-200 flex justify-between items-center">
                  <div>
                      <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        {changes.length > 0 && changes.some(c => c.type === 'DISCREPANCY') ? <AlertTriangle className="text-red-500"/> : changes.length > 0 ? <AlertTriangle className="text-amber-500"/> : <CheckCircle className="text-emerald-500"/>}
                        {changes[0]?.type === 'INFO SYNC' ? 'Data Overlay Sync' : 'Review Updates'}
                      </h3>
                      <p className="text-sm text-slate-500 mt-1">
                          {changes.length === 0 ? "The uploaded file matches the current database exactly." : `Found ${changes.length} changes to apply.`}
                      </p>
                  </div>
                  <button onClick={() => setDiffModalOpen(false)}><X size={24} className="text-slate-400 hover:text-slate-600"/></button>
              </div>

              <div className="overflow-y-auto p-0">
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
                                  <th className="p-4">New Data (Editable)</th>
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
                                                  c.type === 'DISCREPANCY' ? 'bg-red-100 text-red-700 border border-red-300 animate-pulse' :
                                                  c.type === 'ALLOC CHANGE' ? 'bg-indigo-100 text-indigo-700' :
                                                  c.type === 'MOVED OUT' ? 'bg-slate-200 text-slate-500' :
                                                  c.type === 'STAY EXT' ? 'bg-teal-100 text-teal-700' :
                                                  c.type === 'SYNC' ? 'bg-purple-100 text-purple-700' :
                                                  c.type === 'ARRIVAL' ? 'bg-blue-100 text-blue-700' :
                                                  c.type === 'JOINER (ARR)' ? 'bg-fuchsia-100 text-fuchsia-700' :
                                                  c.type === 'DEPARTURE' ? 'bg-rose-100 text-rose-700' :
                                                  c.type === 'INFO SYNC' ? 'bg-slate-100 text-slate-700' :
                                                  'bg-emerald-100 text-emerald-700'
                                              }`}>{c.type}</span>
                                          </td>
                                          <td className="p-4 text-slate-500">
                                              <div className="text-xs">{c.oldGuest ? c.oldGuest.substring(0, 20) : 'Vacant'}</div>
                                              <div className="text-[10px] font-bold uppercase opacity-50">{c.oldStatus}</div>
                                          </td>
                                          <td className="p-4 text-slate-300"><ArrowRight size={16}/></td>
                                          <td className="p-4 text-slate-800 font-medium">
                                              {pendingRec ? (
                                                  <div className="flex flex-col gap-2">
                                                      <div className="flex items-center gap-2">
                                                          <select 
                                                              className={`p-1 border border-slate-200 rounded text-[10px] font-bold uppercase outline-none focus:border-blue-400`}
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
                                                          <div className="text-xs leading-tight font-bold text-slate-600">{c.newGuest ? c.newGuest : 'Vacant'}</div>
                                                      </div>
                                                      
                                                      {(c.isMemoEdit || c.type.includes('ARR') || c.type.includes('DEP') || c.type.includes('SYNC') || c.type.includes('EXT') || c.type.includes('ALLOC')) && (
                                                          <div className="flex flex-wrap gap-2">
                                                              {/* MANUALLY SELECTABLE MEAL PLAN */}
                                                              <select className="w-14 p-1 border border-slate-200 rounded text-[10px] uppercase outline-none focus:border-blue-400" value={pendingRec.meal_plan} onChange={(e) => updatePendingRecord(c.villa, 'meal_plan', e.target.value)}>
                                                                  <option value="">MP</option>
                                                                  <option value="BB">BB</option>
                                                                  <option value="HB">HB</option>
                                                                  <option value="FB">FB</option>
                                                                  <option value="RO">RO</option>
                                                                  <option value="AI">AI</option>
                                                              </select>
                                                              <input className="w-16 p-1 border border-slate-200 rounded text-[10px] uppercase outline-none focus:border-purple-400" value={pendingRec.gem_name} onChange={(e) => updatePendingRecord(c.villa, 'gem_name', e.target.value)} placeholder="GEM" />
                                                              {(pendingRec.status.includes('ARR') || pendingRec.status === 'OCC') && <input type="time" className="w-20 p-1 border border-emerald-200 rounded text-[10px] outline-none" value={pendingRec.arrival_time} onChange={(e) => updatePendingRecord(c.villa, 'arrival_time', e.target.value)} />}
                                                              {(pendingRec.status.includes('DEP') || pendingRec.status === 'OCC') && <input type="time" className="w-20 p-1 border border-rose-200 rounded text-[10px] outline-none" value={pendingRec.departure_time} onChange={(e) => updatePendingRecord(c.villa, 'departure_time', e.target.value)} />}
                                                          </div>
                                                      )}
                                                  </div>
                                              ) : (
                                                  <>
                                                      <div className="text-xs leading-tight">{c.newGuest ? c.newGuest : 'Vacant'}</div>
                                                      <div className={`text-[10px] font-bold uppercase mt-1 ${c.type === 'DISCREPANCY' ? 'text-red-600' : 'text-[#6D2158]'}`}>{c.newStatus}</div>
                                                  </>
                                              )}
                                          </td>
                                          <td className="p-4 text-right">
                                             <button onClick={() => removeChange(i)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors" title="Discard this change">
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

              <div className="p-6 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
                  <button onClick={() => setDiffModalOpen(false)} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-white hover:shadow-sm transition-all">Cancel</button>
                  <button 
                      onClick={handleApproveUpdate} 
                      className="px-6 py-3 rounded-xl font-bold bg-[#6D2158] text-white shadow-lg hover:bg-[#5a1b49] transition-all flex items-center gap-2"
                  >
                      {changes.length === 0 ? "Force Overwrite" : "Approve & Update"}
                  </button>
              </div>
           </div>
        </div>
      )}

      {/* SARONG MODAL */}
      {isSarongModalOpen && (
          <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                  <div className="bg-pink-600 p-5 text-white flex justify-between items-center">
                      <h3 className="text-lg font-bold flex items-center gap-2"><Shirt size={18}/> Tuesday Sarong Allocation</h3>
                      <button onClick={() => setIsSarongModalOpen(false)} className="bg-white/10 p-1.5 rounded-full hover:bg-white/20"><X size={18}/></button>
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
      {isMoveModalOpen && (
          <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                  <div className="bg-[#6D2158] p-5 text-white flex justify-between items-center">
                      <h3 className="text-lg font-bold flex items-center gap-2"><ArrowRightLeft size={18}/> Manual Villa Move</h3>
                      <button onClick={() => setIsMoveModalOpen(false)} className="bg-white/10 p-1.5 rounded-full hover:bg-white/20"><X size={18}/></button>
                  </div>
                  <div className="p-6 space-y-4">
                      <div className="flex items-center gap-4">
                          <div className="flex-1">
                              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">From Villa</label>
                              <input type="text" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-lg font-black text-center text-slate-600 outline-none" value={moveData.from} readOnly/>
                          </div>
                          <ArrowRight className="text-slate-300 mt-4" size={24}/>
                          <div className="flex-1">
                              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">To Villa</label>
                              <input type="text" autoFocus className="w-full p-3 bg-white border-2 border-indigo-200 rounded-xl text-lg font-black text-center text-indigo-700 outline-none focus:border-indigo-500" placeholder="00" value={moveData.to} onChange={e => setMoveData({...moveData, to: e.target.value})}/>
                          </div>
                      </div>
                      <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Move Type</label>
                          <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none" value={moveData.type} onChange={e => setMoveData({...moveData, type: e.target.value})}>
                              <option value="VM/OCC">Stayover Move (VM/OCC)</option>
                              <option value="VM/ARR">Arrival Move (VM/ARR)</option>
                              <option value="DAY USE">Day Use Move (DAY USE)</option>
                          </select>
                      </div>
                      <p className="text-[10px] font-bold text-slate-400 leading-tight italic">Guest profile details will be copied to the new villa. The old villa will become VM/VAC but will retain its profile history for today.</p>
                      
                      <button onClick={handleManualMove} disabled={isProcessing} className="w-full bg-[#6D2158] text-white py-3 rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg hover:bg-[#5a1b49] transition-all flex justify-center items-center gap-2 mt-2">
                          {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <RotateCw size={16}/>} Execute Move
                      </button>

                  </div>
              </div>
          </div>
      )}

      {/* EDIT MODAL */}
      {isEditOpen && editingRecord && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-md rounded-3xl shadow-xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
              <div className="bg-[#6D2158] p-6 text-white">
                  <div className="flex justify-between items-start">
                     <div>
                         <h3 className="text-2xl font-bold">Villa {editingRecord.villa_number}</h3>
                         <p className="text-white/80 text-[10px] font-bold uppercase mt-1 tracking-widest">Guest ID: {editingRecord.stay_id || 'Not Generated'}</p>
                     </div>
                     <button onClick={() => setIsEditOpen(false)} className="bg-white/10 p-1.5 rounded-full hover:bg-white/20"><X size={18}/></button>
                  </div>
                  <div className="flex gap-4 mt-6 text-xs font-bold uppercase tracking-wider">
                      <button onClick={() => setActiveTab('details')} className={`pb-2 border-b-2 ${activeTab === 'details' ? 'border-white text-white' : 'border-transparent text-white/50'}`}>Details</button>
                      <button onClick={() => setActiveTab('prefs')} className={`pb-2 border-b-2 ${activeTab === 'prefs' ? 'border-white text-white' : 'border-transparent text-white/50'}`}>Preferences</button>
                  </div>
              </div>
              <div className="p-6 overflow-y-auto">
                 {activeTab === 'details' ? (
                     <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Status</label>
                                <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700" value={editingRecord.status} onChange={e => setEditingRecord({...editingRecord, status: e.target.value})}>
                                    {['VAC','OCC','ARR','DEP','DEP/ARR','VM/VAC','VM/OCC','VM/ARR','TMA (Day)','TMA (Night)','DAY USE','HOUSE USE','SHOW VILLA'].map(s=><option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">GEM</label>
                                <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700" value={editingRecord.gem_name} onChange={e => setEditingRecord({...editingRecord, gem_name: e.target.value})}/>
                            </div>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Guest Names (Group)</label>
                            <textarea className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold h-20 resize-none text-slate-700" value={editingRecord.guest_name} onChange={e => setEditingRecord({...editingRecord, guest_name: e.target.value})}/>
                        </div>
                        <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Arrival Time</label>
                                <input type="time" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-emerald-700 text-center" value={editingRecord.arrival_time} onChange={e => setEditingRecord({...editingRecord, arrival_time: e.target.value})}/>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Departure Time</label>
                                <input type="time" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-rose-700 text-center" value={editingRecord.departure_time} onChange={e => setEditingRecord({...editingRecord, departure_time: e.target.value})}/>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 border-t border-slate-100 pt-4">
                            <div className="col-span-1"><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Adults</label><input type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-center text-slate-700" value={editingRecord.pax_adults} onChange={e => setEditingRecord({...editingRecord, pax_adults: parseInt(e.target.value) || 0})}/></div>
                            <div className="col-span-1"><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Kids</label><input type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-center text-slate-700" value={editingRecord.pax_kids} onChange={e => setEditingRecord({...editingRecord, pax_kids: parseInt(e.target.value) || 0})}/></div>
                            <div className="col-span-1"><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Dates</label><input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-center text-slate-700" value={editingRecord.stay_dates} onChange={e => setEditingRecord({...editingRecord, stay_dates: e.target.value})}/></div>
                        </div>

                        {/* CLONE TO CONNECTED VILLA BUTTON */}
                        {['87', '57'].includes(editingRecord.villa_number) && (
                            <div className="pt-2">
                                <button onClick={() => handleCloneToConnected(editingRecord.villa_number)} className="w-full py-3 bg-indigo-50 text-indigo-700 rounded-xl text-[10px] font-bold uppercase tracking-widest border border-indigo-200 hover:bg-indigo-100 transition-colors">
                                    Clone Guest to V{editingRecord.villa_number === '87' ? '88' : '56 & 58'}
                                </button>
                            </div>
                        )}
                     </div>
                 ) : (
                     <div className="h-full">
                         <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Guest Preferences & Notes</label>
                         <textarea className="w-full h-48 p-4 bg-amber-50 border border-amber-100 rounded-xl text-sm text-slate-700 outline-none focus:border-amber-300 resize-none" placeholder="e.g. Likes extra water, allergic to nuts..." value={editingRecord.preferences || ''} onChange={e => setEditingRecord({...editingRecord, preferences: e.target.value})}/>
                     </div>
                 )}
              </div>
              <div className="p-6 pt-0">
                  <button onClick={handleSaveEdit} disabled={isProcessing} className="w-full bg-[#6D2158] text-white py-3 rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg hover:bg-[#5a1b49] transition-all flex justify-center items-center gap-2">
                      {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Edit3 size={16}/>}
                      Save Profile
                  </button>
              </div>
           </div>
        </div>
      )}

      {/* PASTE MODAL */}
      {isPasteModalOpen && (
          <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                  <div className="bg-[#6D2158] p-5 text-white flex justify-between items-center">
                      <h3 className="text-lg font-bold flex items-center gap-2"><FileSpreadsheet size={18}/> Paste Operational Memo</h3>
                      <button onClick={() => setIsPasteModalOpen(false)} className="bg-white/10 p-1.5 rounded-full hover:bg-white/20"><X size={18}/></button>
                  </div>
                  <div className="p-6 space-y-4">
                      <p className="text-xs text-slate-500 font-bold">Copy the cells directly from your Excel file and paste them below:</p>
                      <textarea 
                          className="w-full h-64 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-700 outline-none focus:border-[#6D2158] resize-none whitespace-pre" 
                          placeholder="Paste Excel data here..." 
                          value={pastedText} 
                          onChange={(e) => setPastedText(e.target.value)}
                          autoFocus
                      />
                      <div className="flex justify-end gap-3 mt-4">
                          <button onClick={() => setIsPasteModalOpen(false)} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-50 hover:shadow-sm transition-all">Cancel</button>
                          <button onClick={handlePasteSubmit} className="px-6 py-3 rounded-xl font-bold bg-[#6D2158] text-white shadow-lg hover:bg-[#5a1b49] transition-all flex items-center gap-2">
                              Process Data
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* CUSTOM GLOBAL CONFIRM DIALOG */}
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
                      <button onClick={() => setConfirmDialog(null)} className="px-5 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-200 transition-colors">Cancel</button>
                      <button onClick={confirmDialog.onConfirm} className={`px-5 py-2.5 rounded-xl font-bold text-white shadow-md transition-all ${confirmDialog.confirmColor || 'bg-[#6D2158] hover:bg-[#5a1b49]'}`}>
                          {confirmDialog.confirmText || 'Confirm'}
                      </button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
}
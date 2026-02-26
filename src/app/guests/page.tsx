"use client";
import React, { useState, useEffect } from 'react';
import { 
  Edit3, X, ChevronLeft, ChevronRight,
  FileSpreadsheet, Printer, Heart, ArrowRight, AlertTriangle, CheckCircle, Loader2, RotateCw, UploadCloud, User, Baby, ArrowRightLeft, Clock
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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
};

export default function HousekeepingSummaryPage() {
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

  const updateSyncTime = () => {
      const dhakaTime = new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit' });
      setLastSyncTime(dhakaTime);
  };

  useEffect(() => {
    fetchDailyData();

    const channel = supabase
        .channel('daily_summary_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_daily_summary' }, (payload) => {
            fetchDailyData(false); 
            toast.success("Summary updated by another user");
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
    updateSyncTime();
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

  const handleManualMove = async () => {
      if (!moveData.from || !moveData.to) return alert("Please specify both villas.");
      
      const fromRec = masterList.find(r => r.villa_number === moveData.from);
      const toRec = masterList.find(r => r.villa_number === moveData.to);
      
      if (!fromRec || !toRec) return alert("Invalid villa numbers.");

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
  };

  const handleFileProcess = (e: React.ChangeEvent<HTMLInputElement>, type: 'ARRDEP_XML' | 'OPERATIONAL_MEMO' | 'OCC') => {
      const file = e.target.files?.[0];
      if (!file) return;
      setIsProcessing(true);

      const fileName = file.name.toLowerCase();
      const reader = new FileReader();

      reader.onload = (evt) => {
          try {
              const data = evt.target?.result as string;
              
              if (type === 'OCC') {
                  processOCCXML(data);
              } else if (type === 'ARRDEP_XML') {
                  processArrDepXML(data);
              } else if (type === 'OPERATIONAL_MEMO') {
                  if (fileName.endsWith('.xml') && data.includes('<?mso-application progid="Excel.Sheet"?>')) {
                      const wb = XLSX.read(data, { type: 'string' });
                      const ws = wb.Sheets[wb.SheetNames[0]];
                      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
                      processOperationalMemo(rows);
                  } else {
                      const wb = XLSX.read(data, { type: 'binary' });
                      const ws = wb.Sheets[wb.SheetNames[0]];
                      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
                      processOperationalMemo(rows);
                  }
              }
          } catch (err) {
              alert("Error parsing the file. Please ensure it is the correct export format.");
              setIsProcessing(false);
          }
          e.target.value = '';
          setFileInputKey(prev => prev + 1);
      };

      if (type === 'OCC' || type === 'ARRDEP_XML' || (type === 'OPERATIONAL_MEMO' && fileName.endsWith('.xml'))) {
          reader.readAsText(file);
      } else {
          reader.readAsBinaryString(file);
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

      for (const [villa, resList] of Object.entries(resByVilla)) {
          const cleanVilla = normalizeVilla(villa);
          if (!cleanVilla || !currentMap.has(cleanVilla)) continue;
          
          const record = currentMap.get(cleanVilla)!;
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

          let stayDates = '';
          let stayId = '';
          if (arrDate && depDate) {
              const aParts = arrDate.split('-'); const dParts = depDate.split('-');
              if (aParts.length === 3 && dParts.length === 3) {
                  const aMonth = monthToNum(aParts[1]);
                  const dMonth = monthToNum(dParts[1]);
                  stayDates = `${aParts[0].padStart(2, '0')}/${aMonth} - ${dParts[0].padStart(2, '0')}/${dMonth}`;
                  stayId = `${cleanVilla}_${aParts[2]}${aMonth}${aParts[0].padStart(2, '0')}`; 
              }
          }

          const oldStatus = record.status;
          if (!oldStatus.includes('ARR') && !oldStatus.includes('DEP')) {
              record.status = 'OCC';
          }
          
          record.guest_name = names.join(' & ');
          record.pax_adults = totalAdults;
          record.pax_kids = totalKids;
          record.meal_plan = mealPlan;
          record.stay_dates = stayDates;
          record.gem_name = gemName;
          record.stay_id = stayId;

          diffs.push({
              villa: cleanVilla, type: 'SYNC',
              oldGuest: oldStatus === 'VAC' ? 'Vacant' : record.guest_name,
              newGuest: record.guest_name, oldStatus: oldStatus, newStatus: record.status
          });
      }

      currentMap.forEach((rec, vNum) => {
          if (!resByVilla[vNum] && !resByVilla[vNum.padStart(2, '0')] && rec.status === 'OCC') {
              diffs.push({
                  villa: vNum, type: 'CHANGE', 
                  oldGuest: rec.guest_name || 'Checked Out', newGuest: 'Vacant', 
                  oldStatus: 'OCC', newStatus: 'VAC'
              });
              rec.status = 'VAC'; rec.guest_name = ''; rec.pax_adults = 0; rec.pax_kids = 0;
              rec.meal_plan = ''; rec.stay_dates = ''; rec.preferences = ''; rec.gem_name = ''; rec.stay_id = '';
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
      
      reservations.forEach((res: any) => {
          const v = res.querySelector('DISP_ROOM_NO')?.textContent?.trim();
          if (v) {
              if (!resByVilla[v]) resByVilla[v] = [];
              resByVilla[v].push(res);
          }
      });

      for (const [villa, resList] of Object.entries(resByVilla)) {
          const cleanVilla = normalizeVilla(villa);
          if (!cleanVilla || !currentMap.has(cleanVilla)) continue;
          
          const record = currentMap.get(cleanVilla)!;

          let isArr = false; let isDep = false;
          resList.forEach(res => {
              const arrDate = res.querySelector('ARRIVAL')?.textContent || '';
              const depDate = res.querySelector('DEPARTURE')?.textContent || '';
              const aFull = `20${arrDate.split('-')[2]}-${monthToNum(arrDate.split('-')[1])}-${arrDate.split('-')[0].padStart(2, '0')}`;
              const dFull = `20${depDate.split('-')[2]}-${monthToNum(depDate.split('-')[1])}-${depDate.split('-')[0].padStart(2, '0')}`;
              if (aFull === selectedDate) isArr = true;
              if (dFull === selectedDate) isDep = true;
          });

          let finalStatus = 'OCC';
          if (isArr && isDep) finalStatus = 'DEP/ARR';
          else if (isArr) finalStatus = 'ARR';
          else if (isDep) finalStatus = 'DEP';
          else if (resList.some(r => r.querySelector('SHORT_RESV_STATUS')?.textContent?.includes('CKOT'))) finalStatus = 'VAC';

          let primaryResList = resList;
          if (finalStatus === 'DEP/ARR') {
              primaryResList = resList.filter(res => {
                  const arrDate = res.querySelector('ARRIVAL')?.textContent || '';
                  const aFull = `20${arrDate.split('-')[2]}-${monthToNum(arrDate.split('-')[1])}-${arrDate.split('-')[0].padStart(2, '0')}`;
                  return aFull === selectedDate;
              });
          }

          let totalAdults = 0; let totalKids = 0;
          let names: string[] = []; let prefs: string[] = [];
          let mealPlan = 'RO'; let stayDates = ''; let stayId = '';

          primaryResList.forEach(res => {
              const rawName = res.querySelector('FULL_NAME_NO_SHR_IND')?.textContent || res.querySelector('FULL_NAME')?.textContent || '';
              if (rawName) names.push(formatGuestName(rawName));
              
              totalAdults += parseInt(res.querySelector('ADULTS')?.textContent || '0', 10);
              totalKids += parseInt(res.querySelector('CHILDREN')?.textContent || '0', 10);

              const arrDate = res.querySelector('ARRIVAL')?.textContent || '';
              const depDate = res.querySelector('DEPARTURE')?.textContent || '';
              if (arrDate && depDate) {
                  const aParts = arrDate.split('-'); const dParts = depDate.split('-');
                  if (aParts.length === 3 && dParts.length === 3) {
                      const aMonth = monthToNum(aParts[1]);
                      const dMonth = monthToNum(dParts[1]);
                      stayDates = `${aParts[0].padStart(2, '0')}/${aMonth} - ${dParts[0].padStart(2, '0')}/${dMonth}`;
                      stayId = `${cleanVilla}_${aParts[2]}${aMonth}${aParts[0].padStart(2, '0')}`; 
                  }
              }

              const rateCode = (res.querySelector('RATE_CODE')?.textContent || '').toUpperCase();
              const products = (res.querySelector('PRODUCTS')?.textContent || '').toUpperCase();
              if (products.includes('LUN') || rateCode.includes('FB')) mealPlan = 'FB';
              else if ((products.includes('DIN') || rateCode.includes('HB')) && mealPlan !== 'FB') mealPlan = 'HB';
              else if ((products.includes('BFS') || rateCode.includes('BB') || rateCode.includes('PR')) && mealPlan === 'RO') mealPlan = 'BB';

              const comments = Array.from(res.querySelectorAll('RES_COMMENT'));
              comments.forEach((c: any) => { if (c.textContent) prefs.push(c.textContent.trim().replace(/\s+/g, ' ')); });
          });

          const oldStatus = record.status;
          if (finalStatus === 'ARR' && oldStatus.includes('DEP')) finalStatus = 'DEP/ARR';

          record.guest_name = names.join(' & ');
          record.pax_adults = totalAdults;
          record.pax_kids = totalKids;
          record.meal_plan = mealPlan;
          record.stay_dates = stayDates;
          record.status = finalStatus;
          record.stay_id = stayId;
          
          const uniquePrefs = Array.from(new Set(prefs));
          if (uniquePrefs.length > 0) record.preferences = uniquePrefs.join('\n\n');

          diffs.push({
              villa: cleanVilla, type: finalStatus.includes('ARR') ? 'ARRIVAL' : 'SYNC',
              oldGuest: oldStatus === 'VAC' ? 'Vacant' : record.guest_name,
              newGuest: record.guest_name, oldStatus: oldStatus, newStatus: finalStatus
          });
      }

      currentMap.forEach((rec, vNum) => {
          if (!resByVilla[vNum] && !resByVilla[vNum.padStart(2, '0')]) {
              const oldStatus = rec.status;
              if (oldStatus === 'ARR' || oldStatus === 'DEP/ARR') {
                  let newStatus = oldStatus === 'DEP/ARR' ? 'DEP' : 'VAC';
                  
                  diffs.push({
                      villa: vNum, type: 'CHANGE', 
                      oldGuest: rec.guest_name || 'Cancelled', newGuest: newStatus === 'VAC' ? 'Vacant' : 'Departing', 
                      oldStatus: oldStatus, newStatus: newStatus
                  });
                  
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
          if (rowStr.includes('ROOM MOVES')) break; // We use manual UI moves now

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
                      diffs.push({ villa: v, type: 'INFO SYNC', oldGuest: record.guest_name, newGuest: record.guest_name, oldStatus: record.status, newStatus: record.status });
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
                      diffs.push({ villa: v, type: 'INFO SYNC', oldGuest: record.guest_name, newGuest: record.guest_name, oldStatus: record.status, newStatus: record.status });
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

  const handleRollOver = async () => {
      if(!confirm(`Overwrite ${selectedDate} with previous day's data?`)) return;
      setIsRollingOver(true);
      const { data: recentRecords } = await supabase.from('hsk_daily_summary').select('*').lt('report_date', selectedDate).order('report_date', { ascending: false }).limit(200);
      if (!recentRecords || recentRecords.length === 0) { alert("No history found."); setIsRollingOver(false); return; }
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
  };

  const exportPDF = () => {
      const doc = new jsPDF('p', 'mm', 'a4');
      autoTable(doc, { head: [['Villa', 'Status', 'Guest', 'Pax', 'GEM']], body: masterList.map(r => [r.villa_number, r.status, r.guest_name, r.pax_adults+r.pax_kids, r.gem_name]) });
      doc.save(`HK_Summary_${selectedDate}.pdf`);
  };

  const getStatusColor = (s: string) => {
      const st = s?.toUpperCase() || 'VAC';
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
                     {lastSyncTime && <span className="text-[9px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><Clock size={10}/> Sync: {lastSyncTime}</span>}
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

           <input key={`memo-${fileInputKey}`} type="file" id="fileMemo" className="hidden" accept=".xlsm,.xlsx,.xls,.xml" onChange={(e) => handleFileProcess(e, 'OPERATIONAL_MEMO')} />
           <button onClick={() => document.getElementById('fileMemo')?.click()} className="flex items-center gap-2 bg-[#6D2158] text-white px-3 py-2 rounded-lg text-xs font-bold shadow-md hover:bg-[#5a1b49] transition-all">
              {isProcessing ? <Loader2 size={16} className="animate-spin"/> : <FileSpreadsheet size={16}/>} <span className="hidden sm:inline">Arr/Dep Memo</span>
           </button>

        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
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
              {masterList.map((row) => (
                <tr key={row.villa_number} className={`hover:bg-slate-50 transition-colors group ${row.status === 'VAC' ? 'bg-slate-50/30' : ''}`}>
                  
                  {/* STICKY VILLA COLUMN WITH INLINE MOVE BUTTON */}
                  <td className="py-2 px-4 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-50">
                      <div className="flex items-center gap-2">
                          <button onClick={() => { setMoveData({from: row.villa_number, to: '', type: 'VM/OCC'}); setIsMoveModalOpen(true); }} className="p-1.5 text-slate-300 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 rounded-md transition-colors opacity-100 lg:opacity-0 lg:group-hover:opacity-100" title="Move Villa">
                              <ArrowRightLeft size={12}/>
                          </button>
                          <span className="font-bold text-sm text-slate-700">{row.villa_number}</span>
                      </div>
                  </td>

                  <td className="py-2 px-4"><span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${getStatusColor(row.status)}`}>{row.status}</span></td>
                  
                  <td className="py-2 px-4 cursor-pointer" onClick={() => { setEditingRecord(row); setIsEditOpen(true); }}>
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
                                    <span className={`text-[11px] font-bold leading-tight group-hover:text-[#6D2158] transition-colors ${row.status === 'VAC' ? 'text-slate-300' : 'text-slate-700'}`}>
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
                  <td className="py-2 px-4 text-right"><button onClick={() => { setEditingRecord(row); setIsEditOpen(true); }} className="p-1.5 text-slate-300 hover:text-[#6D2158] hover:bg-[#6D2158]/10 rounded-lg transition-colors opacity-100 lg:opacity-0 lg:group-hover:opacity-100"><Edit3 size={14}/></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* CHANGES MODAL */}
      {diffModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
              <div className="bg-slate-50 p-6 border-b border-slate-200 flex justify-between items-center">
                  <div>
                      <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        {changes.length > 0 ? <AlertTriangle className="text-amber-500"/> : <CheckCircle className="text-emerald-500"/>}
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
                          <thead className="bg-slate-50 text-xs uppercase font-bold text-slate-400 sticky top-0">
                              <tr>
                                  <th className="p-4 w-20">Villa</th>
                                  <th className="p-4 w-24">Type</th>
                                  <th className="p-4">Current Data</th>
                                  <th className="p-4 w-8"></th>
                                  <th className="p-4">New Data</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                              {changes.map((c, i) => (
                                  <tr key={i} className="hover:bg-slate-50">
                                      <td className="p-4 font-bold text-slate-700">{c.villa}</td>
                                      <td className="p-4">
                                          <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                                              c.type === 'SYNC' ? 'bg-purple-100 text-purple-700' :
                                              c.type === 'ARRIVAL' ? 'bg-blue-100 text-blue-700' :
                                              c.type === 'DEPARTURE' ? 'bg-rose-100 text-rose-700' :
                                              c.type === 'TMA' ? 'bg-orange-100 text-orange-700' :
                                              c.type === 'DAY USE' ? 'bg-amber-100 text-amber-700' :
                                              c.type === 'MOVE' ? 'bg-indigo-100 text-indigo-700' :
                                              c.type === 'INFO SYNC' ? 'bg-slate-100 text-slate-700' :
                                              'bg-emerald-100 text-emerald-700'
                                          }`}>{c.type}</span>
                                      </td>
                                      <td className="p-4 text-slate-500">
                                          <div className="text-xs">{c.oldGuest ? c.oldGuest.substring(0, 15) : 'Vacant'}</div>
                                          <div className="text-[10px] font-bold uppercase opacity-50">{c.oldStatus}</div>
                                      </td>
                                      <td className="p-4 text-slate-300"><ArrowRight size={16}/></td>
                                      <td className="p-4 text-slate-800 font-medium">
                                          <div className="text-xs">{c.newGuest ? c.newGuest.substring(0, 30) : 'Vacant'}</div>
                                          <div className="text-[10px] font-bold uppercase text-[#6D2158]">{c.newStatus}</div>
                                      </td>
                                  </tr>
                              ))}
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
                     <div><h3 className="text-2xl font-bold">Villa {editingRecord.villa_number}</h3><p className="text-white/80 text-xs font-bold uppercase mt-1">Guest Profile</p></div>
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
                                    {['VAC','OCC','ARR','DEP','DEP/ARR','VM/VAC','VM/OCC','VM/ARR','TMA (Day)','TMA (Night)','DAY USE'].map(s=><option key={s} value={s}>{s}</option>)}
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
    </div>
  );
}
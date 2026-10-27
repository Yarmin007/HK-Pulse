"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Plus, Minus, X, Wine, Wrench, Trash2, 
  Split, Send, Check, Clock, Edit3, Wand2, Loader2, 
  CheckCircle2, AlertTriangle, User, MessageCircle, Sparkles
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/components/ConfirmProvider';
import PageHeader from '@/components/PageHeader';
import toast from 'react-hot-toast';

// --- THE MASTER TIME ENGINE ---
import { getDhakaTime, getDhakaDateStr, formatDisplayTime } from '@/lib/dateUtils';

// --- TYPES ---
type RequestRecord = {
  id: string;
  villa_number: string;
  request_type: string;
  item_details: string;
  is_sent: boolean;
  is_posted: boolean; 
  is_done: boolean;
  request_time: string;
  created_at: string;
  attendant_name: string;
  guest_name?: string;     
  package_tag?: string;    
  chk_number?: string; 
  logged_by?: string; 
};

type MasterItem = {
  article_number: string;
  article_name: string;
  generic_name?: string; 
  category: string;
  is_minibar_item: boolean;
  image_url?: string; 
};

// Target category sorting order
const CATEGORY_ORDER = [
  "BITES",
  "SWEETS",
  "JUICES",
  "SOFT DRINKS",
  "BEER",
  "WINES",
  "WINE",
  "SPIRITS",
  "SPIRIT"
];

const analyzePackage = (mp: string) => {
  const plan = (mp || '').toUpperCase();
  if (plan.includes('SA')) return { type: 'Saint', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  if (plan.includes('SI')) return { type: 'Sinner', color: 'bg-orange-100 text-orange-700 border-orange-200' };
  return { type: mp || 'Std', color: 'bg-slate-100 text-slate-500 border-slate-200' };
};

const extractMainGuest = (fullString: string) => {
  if (!fullString) return 'Guest';
  const parts = fullString.split(/[\/&]/).map(s => s.trim());
  const main = parts.find(p => p.includes('Mr.') || p.includes('Mrs.') || p.includes('Dr.'));
  return main || parts[0];
};

const parseVillas = (input: string, doubleVillas: string[] = []) => {
    if (!input) return [];
    const result = new Set<string>();
    const normalized = input.replace(/&|and/gi, ',').replace(/\s+/g, '');
    const parts = normalized.split(',');

    for (const p of parts) {
        if (!p) continue;
        if (p.includes('-')) {
            const [startStr, endStr] = p.split('-');
            const start = parseInt(startStr.replace(/\D/g, ''), 10);
            const end = parseInt(endStr.replace(/\D/g, ''), 10);
            if (!isNaN(start) && !isNaN(end) && start <= end && end - start < 200) {
                for (let i = start; i <= end; i++) result.add(String(i));
            }
        } else {
            const num = parseInt(p.replace(/\D/g, ''), 10);
            if (!isNaN(num)) result.add(String(num));
        }
    }

    const finalResult = new Set<string>();
    Array.from(result).forEach(v => {
        finalResult.add(v); 
        if (doubleVillas.includes(v)) {
            finalResult.add(`${v}-1`);
            finalResult.add(`${v}-2`);
        }
    });

    return Array.from(finalResult);
};

export default function CoordinatorLog() {
  const { confirmAction } = useConfirm();

  const [records, setRecords] = useState<RequestRecord[]>([]);
  const [dailyGuests, setDailyGuests] = useState<Record<string, any>>({}); 
  const [masterCatalog, setMasterCatalog] = useState<MasterItem[]>([]);
  const [gems, setGems] = useState<string[]>([]);
  const [dailyAllocations, setDailyAllocations] = useState<any[]>([]);
  
  const [hostMap, setHostMap] = useState<Record<string, string>>({});
  const [allHosts, setAllHosts] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null); 
  
  const [currentTime, setCurrentTime] = useState(getDhakaTime());

  const [isMinibarOpen, setIsMinibarOpen] = useState(false);
  const [isOtherOpen, setIsOtherOpen] = useState(false);
  const [otherModalType, setOtherModalType] = useState<'General' | 'GEM'>('General');
  const [isPartialOpen, setIsPartialOpen] = useState(false);
  const [showOverdue, setShowOverdue] = useState(false); 

  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [postModal, setPostModal] = useState({ isOpen: false, id: '', chk: '' });
  const [selectedDate, setSelectedDate] = useState(getDhakaTime());
  
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [jettyFilter, setJettyFilter] = useState('All');
  const [villaSearch, setVillaSearch] = useState('');
  
  const [mbItemSearch, setMbItemSearch] = useState('');
  const [otherItemSearch, setOtherItemSearch] = useState('');
  const [villaNumber, setVillaNumber] = useState('');
  const [guestInfo, setGuestInfo] = useState<any>(null); 
  const [manualTime, setManualTime] = useState('');
  const [requesterSearch, setRequesterSearch] = useState('');
  
  const [mbCart, setMbCart] = useState<{name: string, qty: number, isRefill?: boolean}[]>([]);
  const [mbCategory, setMbCategory] = useState('All');
  const [otherMode, setOtherMode] = useState<'Catalog' | 'Note'>('Catalog');
  const [otherCategory, setOtherCategory] = useState('General');
  const [otherCart, setOtherCart] = useState<{name: string, qty: number}[]>([]);
  const [customNote, setCustomNote] = useState('');
  const [isMagicLoading, setIsMagicLoading] = useState(false);

  const [partialTarget, setPartialTarget] = useState<RequestRecord | null>(null);
  const [partialSelection, setPartialSelection] = useState<string[]>([]);

  useEffect(() => { 
    const sessionStr = localStorage.getItem('hk_pulse_session');
    if (sessionStr) {
        setCurrentUser(JSON.parse(sessionStr));
    }

    fetchHosts(); 
    fetchRecords(); 
    fetchCatalog(); 
    fetchSettings(); 

    const channel = supabase.channel('requests_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_daily_requests' }, () => { fetchRecords(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedDate]);

  useEffect(() => {
      const timer = setInterval(() => setCurrentTime(getDhakaTime()), 60000);
      return () => clearInterval(timer);
  }, []);

  const getAvailableStatuses = () => {
      if (typeFilter === 'Minibar') return ['All', 'Unsent', 'Unposted', 'Done'];
      if (typeFilter === 'General' || typeFilter === 'GEM') return ['All', 'Pending', 'Done'];
      return ['All', 'Unsent', 'Unposted', 'Pending', 'Done'];
  };

  useEffect(() => {
      const validStatuses = getAvailableStatuses();
      if (!validStatuses.includes(statusFilter)) setStatusFilter('All');
  }, [typeFilter]);

  const fetchHosts = async () => {
      const { data, error } = await supabase.from('hsk_hosts').select('id, full_name, nicknames');
      if (!error && data) {
          setAllHosts(data);
          const map: Record<string, string> = {};
          data.forEach(h => {
              if (h.id) map[h.id] = h.nicknames || h.full_name || 'Unknown VA';
          });
          setHostMap(map);
      }
  };

  useEffect(() => {
    const fetchGuestAndVA = async () => {
      const cleanVilla = villaNumber.trim();
      
      if (!cleanVilla || cleanVilla.length < 1) { 
          setGuestInfo(null); 
          if (!isEditing) setRequesterSearch(''); 
          return; 
      }
      
      const dateStr = getDhakaDateStr(selectedDate);
      
      let assignedVA = '';
      if (dailyAllocations.length > 0) {
          const { data: constData } = await supabase.from('hsk_constants').select('label').eq('type', 'double_mb_villas').maybeSingle();
          const dvList = constData?.label ? constData.label.split(',').map((s: string) => s.trim()) : [];

          for (const alloc of dailyAllocations) {
              const rawVillas = alloc.task_details || '';
              const vList = parseVillas(rawVillas, dvList);
              
              const extractedDigits = cleanVilla.replace(/\D/g, '');
              const numericBase = extractedDigits ? String(parseInt(extractedDigits, 10)) : '';
              
              let isMatch = false;
              if (vList.includes(cleanVilla)) isMatch = true;
              else if (numericBase && vList.includes(numericBase)) isMatch = true;
              else if (numericBase && new RegExp(`\\b${numericBase}\\b`).test(rawVillas)) isMatch = true;
              
              if (isMatch) {
                  const hostUUID = alloc.host_id; 
                  const host = allHosts.find(h => String(h.id) === String(hostUUID) || String(h.host_id) === String(hostUUID));
                  if (host) {
                      assignedVA = host.nicknames || host.full_name || host.name || hostUUID;
                  } else {
                      assignedVA = hostMap[hostUUID] || hostUUID; 
                  }
                  break; 
              }
          }
      }

      if (/^\d+$/.test(cleanVilla) || cleanVilla.includes('-')) {
          const { data } = await supabase.from('hsk_daily_summary').select('*').eq('report_date', dateStr).eq('villa_number', cleanVilla).maybeSingle();
          
          if (data) {
            setGuestInfo({ ...data, mainName: extractMainGuest(data.guest_name), pkg: analyzePackage(data.meal_plan), isCheckout: data.status.includes('DEP') });
            if (!isEditing) {
                if (otherModalType === 'GEM' && isOtherOpen) setRequesterSearch(data.gem_name || '');
                else setRequesterSearch(assignedVA || '');
            }
          } else { 
            setGuestInfo(null); 
            if (!isEditing) {
                if (otherModalType !== 'GEM' || isMinibarOpen) setRequesterSearch(assignedVA || '');
                else setRequesterSearch('');
            }
          }
      } else {
          setGuestInfo(null);
          if (!isEditing) {
              if (otherModalType !== 'GEM' || isMinibarOpen) setRequesterSearch(assignedVA || '');
              else setRequesterSearch('');
          }
      }
    };
    
    const timer = setTimeout(fetchGuestAndVA, 300);
    return () => clearTimeout(timer);
  }, [villaNumber, otherModalType, selectedDate, isMinibarOpen, isOtherOpen, dailyAllocations, allHosts, hostMap, isEditing]);

  const fetchCatalog = async () => {
    const { data } = await supabase.from('hsk_master_catalog').select('*').order('article_name');
    if (data) setMasterCatalog(data);
  };

  const fetchSettings = async () => {
    const { data } = await supabase.from('hsk_constants').select('type, label').in('type', ['gem']).order('label');
    if (data) setGems(data.filter(c => c.type === 'gem').map(c => c.label));
  };

  const isOnlyRefills = (details: string) => {
      const items = (details || '').split(/\n/).map(s => s.trim()).filter(Boolean);
      if (items.length === 0) return false;
      return items.every(item => item.includes('(Refill)'));
  };

  const fetchRecords = async () => {
    const dateStr = getDhakaDateStr(selectedDate);
    const dayStartStr = `${dateStr}T00:00:00+06:00`;
    const dayEndStr = `${dateStr}T23:59:59+06:00`;

    const [reqRes, overdueRes, guestRes, allocRes] = await Promise.all([
        supabase.from('hsk_daily_requests').select('*').gte('request_time', dayStartStr).lte('request_time', dayEndStr).order('request_time', { ascending: false }),
        supabase.from('hsk_daily_requests').select('*').lt('request_time', dayStartStr).order('request_time', { ascending: false }).limit(100),
        supabase.from('hsk_daily_summary').select('villa_number, meal_plan, stay_dates, status, gem_name').eq('report_date', dateStr),
        supabase.from('hsk_allocations').select('host_id, task_details').eq('report_date', dateStr) 
    ]);
    
    if (allocRes.data) setDailyAllocations(allocRes.data);

    let allRecords = reqRes.data || [];
    
    if (overdueRes.data) {
        const trueOverdue = overdueRes.data.filter(r => {
            if (r.request_type === 'Minibar') {
                if (isOnlyRefills(r.item_details)) return !r.is_sent;
                return !r.is_sent || !r.is_posted;
            }
            return !r.is_done;
        });
        allRecords = [...allRecords, ...trueOverdue];
    }

    setRecords(allRecords);
    
    if (guestRes.data) {
        const gMap: Record<string, any> = {};
        guestRes.data.forEach(g => { gMap[g.villa_number] = g; });
        setDailyGuests(gMap);
    }
  };

  const handleOpenModal = (type: 'Minibar' | 'General' | 'GEM') => {
    const dhakaTimeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', hour12: false });
    setManualTime(dhakaTimeFormatter.format(getDhakaTime()));
    
    setVillaNumber(''); setGuestInfo(null); setMbCart([]); setOtherCart([]); setCustomNote(''); setRequesterSearch(''); setMbItemSearch(''); setOtherItemSearch('');
    setOtherCategory('General'); setIsEditing(false); setEditingId(null);
    
    if (type === 'Minibar') setIsMinibarOpen(true);
    else { setOtherModalType(type); setOtherMode(type === 'GEM' ? 'Note' : 'Catalog'); setIsOtherOpen(true); }
  };

  const handleEditRecord = (record: RequestRecord) => {
    setIsEditing(true); 
    setEditingId(record.id);
    setVillaNumber(record.villa_number);
    const dhakaTimeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', hour12: false });
    setManualTime(dhakaTimeFormatter.format(new Date(record.request_time)));
    setRequesterSearch(record.attendant_name);
    
    if (record.request_type === 'Minibar') {
      const items = (record.item_details || '').split('\n').map(line => {
        const cleanLine = line.replace(/\s*\(SENT\)$/, '');
        const match = cleanLine.match(/(\d+)x (.+)/);
        const isRef = cleanLine.includes('(Refill)');
        let n = match ? match[2] : cleanLine;
        if (isRef) n = n.replace(' (Refill)', '');
        return { name: n.trim(), qty: match ? parseInt(match[1]) : 1, isRefill: isRef };
      });
      setMbCart(items);
      setIsMinibarOpen(true);
    } else {
      const cleanNote = (record.item_details || '').split('\n').map(l => l.replace(/\s*\(SENT\)$/, '')).join('\n');
      setCustomNote(cleanNote);
      setOtherMode('Note');
      setOtherModalType(record.request_type === 'GEM Request' ? 'GEM' : 'General');
      setOtherCategory(record.request_type);
      setIsOtherOpen(true);
    }
  };

  const addToCart = (item: string, type: 'MB' | 'Other') => {
    const cart = type === 'MB' ? mbCart : otherCart;
    const setter = type === 'MB' ? setMbCart : setOtherCart;
    const existing = cart.find(i => i.name === item);
    if (existing) {
        setter(cart.map(i => i.name === item ? { ...i, qty: i.qty + 1 } : i));
    } else {
        setter([...cart, { name: item, qty: 1, isRefill: false }]);
    }
  };

  const updateCartQty = (item: string, delta: number, type: 'MB' | 'Other') => {
    if (type === 'MB') {
      setMbCart(prev => prev.map(i => i.name === item ? { ...i, qty: i.qty + delta } : i).filter(i => i.qty > 0));
    } else {
      setOtherCart(prev => prev.map(i => i.name === item ? { ...i, qty: i.qty + delta } : i).filter(i => i.qty > 0));
    }
  };

  const toggleRefill = (name: string) => {
    setMbCart(mbCart.map(i => i.name === name ? { ...i, isRefill: !i.isRefill } : i));
  };

  const handleMagicFormat = async () => {
    if (!customNote.trim()) return;
    setIsMagicLoading(true);
    try {
        const res = await fetch('/api/magic', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: customNote })
        });
        
        if (!res.ok) throw new Error('API failed');
        const data = await res.json();
        
        if (data.villa && !villaNumber) setVillaNumber(data.villa);
        if (data.category && otherModalType !== 'GEM') setOtherCategory(data.category);
        setCustomNote(data.summary);
        toast.success('Magic formatting applied!');
    } catch {
        let v = "";
        const vMatch = customNote.match(/villa\s*(\d{1,3})/i);
        if (vMatch) v = vMatch[1];

        const fragments = customNote
            .replace(/please (can you )?(bring|send|provide|give|ensure that)/gi, '')
            .replace(/dear team,?/gi, '')
            .replace(/as conversed,?/gi, '')
            .replace(/kindly proceed( with service)?\.?/gi, '')
            .replace(/thank you\.?/gi, '')
            .split(/(?:\n|\. | and |, | also | \+ )+/)
            .map(s => s.trim())
            .filter(s => s.length > 2);

        const bulleted = fragments.map(f => `• ${f.charAt(0).toUpperCase() + f.slice(1)}`).join('\n');
        if (v && !villaNumber) setVillaNumber(v);
        setCustomNote(bulleted);
        toast.success('Basic formatting applied');
    }
    setIsMagicLoading(false);
  };

  const submitRequest = async (type: 'Minibar' | 'Other') => {
    if (!villaNumber) { toast.error("Villa Required"); return; }
    
    let details = '';
    let reqType = 'General';

    if (type === 'Minibar') {
        if (mbCart.length === 0) { toast.error("Add at least one Minibar item"); return; }
        details = mbCart.map(i => `${i.qty}x ${i.name}${i.isRefill ? ' (Refill)' : ''}`).join('\n');
        reqType = 'Minibar';
    } else {
        details = otherMode === 'Catalog' ? otherCart.map(i => `${i.qty}x ${i.name}`).join('\n') : customNote;
        if (!details.trim()) { toast.error("Enter request details or select items"); return; }
        reqType = otherModalType === 'GEM' ? 'GEM Request' : otherCategory; 
    }

    const dateStr = getDhakaDateStr(selectedDate);
    const dbTimeStr = `${dateStr}T${manualTime}:00+06:00`; 
    
    let attendantName = requesterSearch;
    if (!attendantName) {
        if (reqType === 'Minibar') attendantName = 'VA';
        else if (reqType === 'GEM Request') attendantName = guestInfo?.gem_name || 'GEM';
        else attendantName = 'Staff';
    }

    const loggedByName = currentUser ? (currentUser.nicknames || currentUser.full_name || currentUser.name || 'Staff') : 'Admin';

    const payload = {
       villa_number: villaNumber,
       request_type: reqType,
       item_details: details,
       request_time: dbTimeStr, 
       attendant_name: attendantName,
       guest_name: guestInfo ? guestInfo.mainName : '',
       package_tag: guestInfo?.pkg?.type || '',
       logged_by: loggedByName
    };

    const { error } = isEditing 
      ? await supabase.from('hsk_daily_requests').update(payload).eq('id', editingId) 
      : await supabase.from('hsk_daily_requests').insert(payload);
      
    if (!error) { 
      setIsMinibarOpen(false); setIsOtherOpen(false); fetchRecords(); 
      toast.success(isEditing ? "Updated" : "Saved"); 
    } else {
      toast.error("Error saving request.");
      console.error(error);
    }
  };

  const handleOpenPost = (r: RequestRecord) => {
      if (r.is_posted && r.chk_number) {
          setPostModal({ isOpen: true, id: r.id, chk: r.chk_number });
      } else {
          const chks = records.map(x => parseInt(x.chk_number || '0')).filter(n => !isNaN(n) && n > 1000000);
          const nextChk = chks.length > 0 ? Math.max(...chks) + 1 : 10703132;
          setPostModal({ isOpen: true, id: r.id, chk: nextChk.toString() });
      }
  };

  const confirmPost = async () => {
      if (!postModal.chk) return toast.error("Enter CHK number");
      await supabase.from('hsk_daily_requests').update({ is_posted: true, chk_number: postModal.chk }).eq('id', postModal.id);
      setRecords(records.map(r => r.id === postModal.id ? { ...r, is_posted: true, chk_number: postModal.chk } : r));
      setPostModal({ isOpen: false, id: '', chk: '' });
      toast.success('Bill successfully linked');
  };

  const askDelete = async (id: string) => { 
      const isConfirmed = await confirmAction({
          title: 'Delete Log?',
          message: 'Are you sure you want to remove this log? This cannot be undone.',
          confirmText: 'Confirm Delete',
          isDestructive: true
      });
      
      if (isConfirmed) {
          await supabase.from('hsk_daily_requests').delete().eq('id', id);
          setRecords(prev => prev.filter(r => r.id !== id));
          toast.success("Log Deleted");
      }
  };

  const toggleStatus = async (id: string, field: 'is_sent' | 'is_done') => {
    const record = records.find(r => r.id === id);
    if (!record) return;
    const newValue = !record[field];
    setRecords(records.map(r => r.id === id ? { ...r, [field]: newValue } : r));
    await supabase.from('hsk_daily_requests').update({ [field]: newValue }).eq('id', id);
  };

  const handleWhatsApp = (record: RequestRecord, type: 'inform' | 'done') => {
      const cleanDetails = (record.item_details || '')
          .split(/\n/)
          .map(s => {
              let clean = s.trim().replace(/^[•\-\*]\s*/, '');
              if (clean.endsWith('(SENT)')) {
                  clean = clean.replace(/\s*\(SENT\)$/, '') + ' ✅';
              }
              return clean;
          })
          .filter(Boolean)
          .join('\n- ');

      let text = '';
      if (type === 'inform') {
          text = `V${record.villa_number}\n- ${cleanDetails}`;
          if (!record.is_sent) toggleStatus(record.id, 'is_sent'); 
      } else {
          text = `V${record.villa_number}\n- ${cleanDetails}\nDONE ✅`;
          if (!record.is_done) toggleStatus(record.id, 'is_done');
      }

      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const openPartialModal = (record: RequestRecord) => {
      setPartialTarget(record);
      const allItemsRaw = (record.item_details || '').split(/\n/).map(s => s.trim().replace(/^[•\-\*]\s*/, '')).filter(Boolean);
      const alreadySent = allItemsRaw.filter(i => i.endsWith('(SENT)')).map(i => i.replace(/\s*\(SENT\)$/, ''));
      setPartialSelection(alreadySent);
      setIsPartialOpen(true);
  };

  const submitPartial = async () => {
      if (!partialTarget) return;
      const allItemsRaw = (partialTarget.item_details || '').split(/\n/).map(s => s.trim().replace(/^[•\-\*]\s*/, '')).filter(Boolean);
      
      const updatedItems = allItemsRaw.map(item => {
          const baseItem = item.replace(/\s*\(SENT\)$/, '');
          if (partialSelection.includes(baseItem)) {
              return `${baseItem} (SENT)`;
          }
          return baseItem;
      });
      
      const allSent = updatedItems.length > 0 && updatedItems.every(i => i.endsWith('(SENT)'));
      const newItemDetails = updatedItems.join('\n');
      
      await supabase.from('hsk_daily_requests')
          .update({ 
              item_details: newItemDetails, 
              is_sent: allSent 
          })
          .eq('id', partialTarget.id);
          
      setIsPartialOpen(false); 
      fetchRecords();
  };

  const visibleRecords = records.filter(r => {
      const vNum = parseInt(r.villa_number);
      const isMB = r.request_type === 'Minibar';
      const isGemReq = r.request_type === 'GEM Request';
      const onlyRefills = isOnlyRefills(r.item_details);
      
      const dateStr = getDhakaDateStr(selectedDate);
      const isPreviousDay = r.request_time < `${dateStr}T00:00:00+06:00`;

      if (isPreviousDay && !showOverdue) return false;

      if (typeFilter === 'Minibar' && !isMB) return false;
      if (typeFilter === 'GEM' && !isGemReq) return false;
      if (typeFilter === 'General' && (isMB || isGemReq)) return false;

      if (statusFilter === 'Unsent') { if (!isMB || r.is_sent) return false; }
      if (statusFilter === 'Unposted') { if (!isMB || r.is_posted || onlyRefills) return false; }
      if (statusFilter === 'Pending') { if (isMB || r.is_done) return false; }
      if (statusFilter === 'Done') {
          if (isMB && (!r.is_sent || !r.is_posted) && !onlyRefills) return false;
          if (isMB && onlyRefills && !r.is_sent) return false;
          if (!isMB && !r.is_done) return false;
      }
      
      if (villaSearch && !r.villa_number.toLowerCase().includes(villaSearch.toLowerCase()) && !(r.attendant_name || '').toLowerCase().includes(villaSearch.toLowerCase()) && !(r.item_details || '').toLowerCase().includes(villaSearch.toLowerCase())) return false;
      if (jettyFilter === 'Jetty A' && !(vNum >= 1 && vNum <= 35)) return false;
      if (jettyFilter === 'Jetty B' && !(vNum >= 37 && vNum <= 50)) return false;
      if (jettyFilter === 'Jetty C' && !(vNum >= 59 && vNum <= 79)) return false;
      if (jettyFilter === 'Beach' && ((vNum >= 1 && vNum <= 35) || (vNum >= 37 && vNum <= 50) || (vNum >= 59 && vNum <= 79))) return false;
      return true;
  });

  // Filter and sort minibar items strictly by your custom sequence and rules
  const visibleMinibarItems = useMemo(() => {
    return masterCatalog
      .filter(i => {
        if (!i.is_minibar_item) return false;
        
        const cat = (i.category || '').toUpperCase().trim();
        const name = (i.article_name || '').toLowerCase();
        const gen = (i.generic_name || '').toLowerCase();

        // 1. Hide general requests & baby/retail items from minibar
        if (cat.includes('GENERAL') || cat.includes('RETAIL') || cat.includes('AMENITIES')) return false;
        if (name.includes('diaper') || name.includes('daiper') || name.includes('wipe')) return false;

        // 2. Hide Dom Perignon and RW Stags from standard view unless explicitly searched
        if (!mbItemSearch) {
          if (name.includes('dom perignon') || gen.includes('dom perignon')) return false;
          if (name.includes('stags') || gen.includes('stags') || name.includes('rw stag') || gen.includes('rw stag')) return false;
        }

        // Search text matching
        if (mbItemSearch) {
          const q = mbItemSearch.toLowerCase();
          return name.includes(q) || gen.includes(q) || (i.category || '').toLowerCase().includes(q);
        }

        // Category filter
        if (mbCategory !== 'All' && i.category !== mbCategory) return false;

        return true;
      })
      .sort((a, b) => {
        const catA = (a.category || '').toUpperCase().trim();
        const catB = (b.category || '').toUpperCase().trim();
        
        let indexA = CATEGORY_ORDER.findIndex(o => catA.includes(o));
        let indexB = CATEGORY_ORDER.findIndex(o => catB.includes(o));
        
        if (indexA === -1) indexA = 999;
        if (indexB === -1) indexB = 999;

        if (indexA !== indexB) return indexA - indexB;
        return (a.generic_name || a.article_name).localeCompare(b.generic_name || b.article_name);
      });
  }, [masterCatalog, mbCategory, mbItemSearch]);

  const minibarCats = useMemo(() => {
    const rawCats = Array.from(new Set(
      masterCatalog
        .filter(i => i.is_minibar_item && !['GENERAL REQUESTS', 'RETAIL'].includes((i.category || '').toUpperCase().trim()))
        .map(i => i.category)
    )).filter(Boolean) as string[];

    return ['All', ...rawCats.sort((a, b) => {
      let indexA = CATEGORY_ORDER.findIndex(o => a.toUpperCase().includes(o));
      let indexB = CATEGORY_ORDER.findIndex(o => b.toUpperCase().includes(o));
      if (indexA === -1) indexA = 999;
      if (indexB === -1) indexB = 999;
      return indexA - indexB;
    })];
  }, [masterCatalog]);

  const GuestCard = () => {
      if (!guestInfo) return null;
      let depDate = '-';
      if (guestInfo.stay_dates) {
          const parts = guestInfo.stay_dates.split('-');
          if (parts.length > 1) depDate = parts[1].trim();
          else depDate = guestInfo.stay_dates;
      }

      const mealPlan = guestInfo.meal_plan || 'RO';

      return (
        <div className={`mt-2 p-2.5 rounded-xl border-l-4 shadow-xs animate-in zoom-in-95 text-xs ${guestInfo.isCheckout ? 'bg-rose-50/90 border-rose-500' : 'bg-blue-50/80 border-blue-500'}`}>
            <div className="flex justify-between items-start gap-1">
                <div className="min-w-0">
                    <h3 className="font-black text-slate-800 flex items-center gap-1.5 truncate text-xs">
                      <User size={12} className="text-slate-400 shrink-0"/>
                      <span className="truncate">{guestInfo.mainName || 'Guest'}</span>
                    </h3>
                    <p className="text-[10px] text-slate-500 font-bold mt-0.5">
                        Dep: <span className="text-slate-800 font-mono">{depDate}</span>
                    </p>
                </div>
                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border bg-white shrink-0 ${guestInfo.pkg?.color || 'border-slate-200 text-slate-500'}`}>
                    {mealPlan}
                </span>
            </div>
            {guestInfo.isCheckout && (
              <div className="mt-1 flex items-center gap-1 text-rose-600 font-black text-[9px] uppercase tracking-widest">
                <AlertTriangle size={10}/> Checkout Today
              </div>
            )}
        </div>
      );
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#F8FAFC] font-sans text-slate-800">
      
      <PageHeader 
        title="Request & Minibar Log"
        date={selectedDate}
        onDateChange={setSelectedDate}
        actions={
          <div className="flex gap-2 w-full md:w-auto">
            <button 
              onClick={() => handleOpenModal('Minibar')} 
              className="flex-1 md:flex-initial justify-center bg-rose-600 hover:bg-rose-700 active:scale-95 text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm shadow-rose-600/20 transition-all cursor-pointer"
            >
              <Wine size={15} />
              <span>Minibar</span>
            </button>
            <button 
              onClick={() => handleOpenModal('General')} 
              className="flex-1 md:flex-initial justify-center bg-[#6D2158] hover:bg-[#5a1b49] active:scale-95 text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm shadow-[#6D2158]/20 transition-all cursor-pointer"
            >
              <Plus size={15} />
              <span>Gen Req</span>
            </button>
            <button 
              onClick={() => handleOpenModal('GEM')} 
              className="flex-1 md:flex-initial justify-center bg-amber-500 hover:bg-amber-600 active:scale-95 text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm shadow-amber-500/20 transition-all cursor-pointer"
            >
              <Sparkles size={15} />
              <span>GEM Req</span>
            </button>
          </div>
        }
      />

      {/* FILTER AND SEARCH BAR */}
      <div className="px-3 sm:px-6 mt-3">
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search by Villa No, Host Name, or Item..." 
              className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-700 outline-none focus:bg-white focus:border-[#6D2158] transition-all" 
              value={villaSearch} 
              onChange={e => setVillaSearch(e.target.value)}
            />
            {villaSearch && (
              <button onClick={() => setVillaSearch('')} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 p-0.5">
                <X size={15} />
              </button>
            )}
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider mr-1">Type:</span>
              {['All', 'Minibar', 'General', 'GEM'].map(t => (
                <button 
                  key={t} 
                  onClick={() => setTypeFilter(t)} 
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap active:scale-95 cursor-pointer ${
                    typeFilter === t ? 'bg-slate-800 text-white shadow-xs' : 'bg-slate-100 text-slate-500 hover:bg-slate-200/70'
                  }`}
                >
                  {t}
                </button>
              ))}

              <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block" />

              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider mr-1 ml-1 sm:ml-0">State:</span>
              {getAvailableStatuses().map(f => (
                <button 
                  key={f} 
                  onClick={() => setStatusFilter(f)} 
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap active:scale-95 cursor-pointer ${
                    statusFilter === f ? 'bg-[#6D2158] text-white shadow-xs' : 'bg-slate-100 text-slate-500 hover:bg-slate-200/70'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 lg:pb-0">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider mr-1 shrink-0">Zone:</span>
              {['All', 'Jetty A', 'Jetty B', 'Jetty C', 'Beach'].map(j => (
                <button 
                  key={j} 
                  onClick={() => setJettyFilter(j)} 
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap active:scale-95 cursor-pointer ${
                    jettyFilter === j ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-500 hover:bg-slate-200/70'
                  }`}
                >
                  {j}
                </button>
              ))}
              <button 
                onClick={() => setShowOverdue(!showOverdue)} 
                className={`ml-1 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap active:scale-95 cursor-pointer ${
                  showOverdue ? 'bg-rose-600 text-white shadow-xs' : 'bg-rose-50 text-rose-600 border border-rose-200'
                }`}
              >
                {showOverdue ? 'Hide Overdue' : 'Overdue'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* REQUEST CARDS GRID */}
      <div className="p-3 sm:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 pb-32">
         {visibleRecords.length === 0 ? (
           <div className="col-span-full bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-slate-400 font-bold text-xs">
             No requests matching current filters.
           </div>
         ) : (
           visibleRecords.map(r => {
             const allRefill = isOnlyRefills(r.item_details);
             const isGemReq = r.request_type === 'GEM Request';
             
             const gInfo = dailyGuests[r.villa_number] || dailyGuests[r.villa_number.replace('-1', '').replace('-2', '')];
             
             let depDate = '';
             if (gInfo?.stay_dates) {
                 const parts = gInfo.stay_dates.split('-');
                 if (parts.length > 1) depDate = parts[1].trim();
                 else depDate = gInfo.stay_dates;
             }
             
             const mealPlan = gInfo?.meal_plan || r.package_tag || '';
             const isCheckout = gInfo?.status?.includes('DEP');

             const reqTimeMs = new Date(r.request_time).getTime();
             const diffMins = Math.floor((currentTime.getTime() - reqTimeMs) / 60000);
             let timeStr = '';
             if (diffMins < 0) {
                 timeStr = `In ${Math.abs(diffMins)}m`;
             } else if (diffMins >= 1440) {
                 const days = Math.floor(diffMins / 1440);
                 const remainingHours = Math.floor((diffMins % 1440) / 60);
                 timeStr = `${days}d ${remainingHours}h ago`;
             } else if (diffMins >= 60) {
                 timeStr = `${Math.floor(diffMins/60)}h ${diffMins%60}m ago`;
             } else {
                 timeStr = `${diffMins}m ago`;
             }
             
             const isPending = r.request_type === 'Minibar' ? (!r.is_sent || (!allRefill && !r.is_posted)) : !r.is_done;
             const isUrgent = isPending && diffMins > 30;
             const isCompleted = !isPending;
             
             const dateStr = getDhakaDateStr(selectedDate);
             const isPreviousDay = r.request_time < `${dateStr}T00:00:00+06:00`;
             
             let pastDateStr = '';
             if (isPreviousDay) {
                 pastDateStr = new Date(r.request_time).toLocaleDateString('en-GB', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short' });
             }

             return (
             <div 
               key={r.id} 
               className={`bg-white rounded-2xl border overflow-hidden flex flex-col justify-between transition-all ${
                 isCompleted 
                   ? 'opacity-70 bg-slate-50/70 border-slate-200' 
                   : isUrgent 
                   ? 'border-rose-400 ring-2 ring-rose-100 shadow-sm' 
                   : r.request_type === 'Minibar' 
                   ? 'border-rose-200/80 shadow-xs hover:shadow-md' 
                   : isGemReq 
                   ? 'border-amber-200/90 shadow-xs hover:shadow-md' 
                   : 'border-slate-200/80 shadow-xs hover:shadow-md'
               }`}
             >
                {isPreviousDay && !isCompleted && (
                    <div className="bg-rose-600 text-white text-[9px] font-black px-2 py-1 w-full text-center tracking-widest uppercase flex items-center justify-center gap-1">
                        <AlertTriangle size={10} /> Overdue (From {pastDateStr})
                    </div>
                )}

                <div className="p-4 flex flex-col h-full">
                    <div className="flex justify-between items-start gap-2 mb-3">
                       <div className="flex flex-col gap-1">
                           <div className="flex items-center gap-1.5">
                             <span className="text-xl font-black text-slate-900 font-mono tracking-tight leading-none">
                               V{r.villa_number}
                             </span>
                             <button 
                               onClick={() => handleEditRecord(r)} 
                               className="p-1 text-slate-400 hover:text-[#6D2158] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer" 
                               title="Edit"
                             >
                               <Edit3 size={13}/>
                             </button>
                           </div>
                           
                           <div className="flex items-center gap-1 flex-wrap mt-0.5">
                               {mealPlan && (
                                 <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-black uppercase border border-slate-200">
                                   {mealPlan}
                                 </span>
                               )}
                               {depDate && (
                                 <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border font-mono ${
                                   isCheckout ? 'bg-rose-100 text-rose-700 border-rose-200 font-black' : 'bg-slate-50 text-slate-400 border-slate-200'
                                 }`}>
                                   Dep: {depDate}
                                 </span>
                               )}
                           </div>
                       </div>

                       <div className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider shrink-0 border ${
                         r.request_type === 'Minibar' 
                           ? 'bg-rose-50 text-rose-700 border-rose-200' 
                           : isGemReq 
                           ? 'bg-amber-50 text-amber-700 border-amber-200' 
                           : 'bg-purple-50 text-[#6D2158] border-purple-200'
                       }`}>
                           {r.request_type === 'General Request' ? 'Gen Req' : r.request_type}
                       </div>
                    </div>
                    
                    <div className="mb-4 text-xs font-bold text-slate-700 leading-relaxed space-y-1 bg-slate-50/70 p-3 rounded-xl border border-slate-100">
                        {(r.item_details || '').split(/\n/).map((item: string, idx: number) => {
                            const cleanItem = item.trim().replace(/^[•\-\*]\s*/, '');
                            if (!cleanItem) return null;
                            
                            const isSentItem = cleanItem.endsWith('(SENT)');
                            const displayText = cleanItem.replace(/\s*\(SENT\)$/, '');
                            
                            return (
                                <div key={idx} className={`flex items-start justify-between gap-2 ${isSentItem ? 'text-slate-400 line-through' : ''}`}>
                                    <span>• {displayText}</span>
                                    {isSentItem && <CheckCircle2 size={13} className="text-emerald-500 shrink-0 mt-0.5" />}
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-auto pt-2.5 border-t border-slate-100 flex items-end justify-between gap-2">
                       <div className="min-w-0">
                          <div className="text-[10px] text-slate-700 font-black uppercase truncate">{r.attendant_name}</div>
                          
                          <div className={`text-[10px] font-bold mt-0.5 flex flex-wrap items-center gap-1.5 ${isUrgent ? 'text-rose-600' : 'text-slate-400'}`}>
                              <span className="flex items-center font-mono">
                                  <Clock size={10} className="mr-1"/>
                                  {formatDisplayTime(r.request_time)} 
                              </span>
                              <span className={`px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider font-black ${isUrgent ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>
                                  {timeStr}
                              </span>
                          </div>

                          {r.chk_number && <div className="text-[10px] text-emerald-700 font-mono font-black mt-1">CHK #{r.chk_number}</div>}
                          {r.logged_by && <div className="text-[9px] text-slate-400 font-semibold mt-0.5">By: {r.logged_by}</div>}
                       </div>
                       
                       <div className="flex gap-1.5 shrink-0">
                         {r.request_type === 'Minibar' ? (
                             <>
                                 <button onClick={() => openPartialModal(r)} className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 active:scale-90 transition-all cursor-pointer" title="Split Send"><Split size={14}/></button>
                                 <button onClick={() => toggleStatus(r.id, 'is_sent')} className={`p-2 rounded-xl active:scale-90 transition-all cursor-pointer ${r.is_sent ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-500 hover:bg-blue-50 hover:text-blue-600'}`} title="Mark Sent"><Send size={14}/></button>
                                 
                                 {!allRefill && (
                                     <button onClick={() => handleOpenPost(r)} className={`p-2 rounded-xl active:scale-90 transition-all cursor-pointer ${r.is_posted ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600'}`} title={r.is_posted ? "Edit Bill" : "Post CHK Bill"}>
                                         <Check size={14}/>
                                     </button>
                                 )}
                             </>
                         ) : (
                             <>
                                 <button onClick={() => handleWhatsApp(r, 'inform')} className="p-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 active:scale-90 transition-all cursor-pointer" title="WhatsApp Inform">
                                     <MessageCircle size={14} />
                                 </button>
                                 <button onClick={() => toggleStatus(r.id, 'is_sent')} className={`p-2 rounded-xl active:scale-90 transition-all cursor-pointer ${r.is_sent ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-500 hover:bg-blue-50 hover:text-blue-600'}`} title={r.is_sent ? 'Informed' : 'Mark Informed'}>
                                     <Send size={14}/>
                                 </button>
                                 <button onClick={() => handleWhatsApp(r, 'done')} className="p-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 active:scale-90 transition-all flex items-center gap-0.5 cursor-pointer" title="WhatsApp Done">
                                     <MessageCircle size={14}/><Check size={10} strokeWidth={4}/>
                                 </button>
                                 <button onClick={() => toggleStatus(r.id, 'is_done')} className={`p-2 rounded-xl active:scale-90 transition-all cursor-pointer ${r.is_done ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600'}`} title="Mark Done">
                                     <Check size={14}/>
                                 </button>
                             </>
                         )}
                         <button onClick={() => askDelete(r.id)} className="p-2 rounded-xl text-slate-300 hover:bg-rose-50 hover:text-rose-600 active:scale-90 transition-all cursor-pointer" title="Delete"><Trash2 size={14}/></button>
                       </div>
                    </div>
                </div>
             </div>
             );
           })
         )}
      </div>

      {/* POST BILL MODAL */}
      {postModal.isOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[9999] flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95">
                  <h3 className="text-xl font-black text-[#6D2158] text-center mb-1 uppercase tracking-tight">Post Minibar Bill</h3>
                  <p className="text-[11px] font-bold text-slate-400 text-center mb-5 uppercase tracking-widest">Confirm POS Check (CHK) Number</p>
                  <input 
                      type="number" 
                      className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-mono font-black text-center text-3xl text-slate-800 outline-none focus:border-[#6D2158] mb-5"
                      value={postModal.chk}
                      onChange={e => setPostModal({...postModal, chk: e.target.value})}
                      autoFocus
                  />
                  <div className="flex gap-2.5">
                      <button onClick={() => setPostModal({isOpen: false, id: '', chk: ''})} className="flex-1 py-3.5 bg-slate-100 text-slate-600 rounded-xl font-bold uppercase text-xs hover:bg-slate-200 cursor-pointer">
                        Cancel
                      </button>
                      <button onClick={confirmPost} className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black uppercase text-xs shadow-md cursor-pointer">
                        Link & Post
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* ========================================================================= */}
      {/* COMPACT FULL-SCREEN FIT MINIBAR MODAL                                     */}
      {/* ========================================================================= */}
      {isMinibarOpen && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[9999] flex items-end md:items-center justify-center p-0 md:p-3">
            <div className="bg-white rounded-t-3xl md:rounded-3xl shadow-2xl w-full max-w-6xl h-[94vh] md:h-[88vh] flex flex-col overflow-hidden border border-slate-200 animate-in slide-in-from-bottom-6 md:zoom-in-95">
               
               {/* Modal Compact Header */}
               <div className="px-4 py-2.5 bg-white border-b border-slate-100 flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                      <Wine size={16}/>
                    </div>
                    <div>
                      <h3 className="text-sm sm:text-base font-black text-slate-800 leading-none">
                        {isEditing ? 'Edit Minibar Log' : 'New Minibar Consumption Log'}
                      </h3>
                      <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                        Tap any item to add • Filter by exact category sequence
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setIsMinibarOpen(false)} className="bg-slate-100 hover:bg-slate-200 p-1.5 rounded-full text-slate-500 transition-colors cursor-pointer">
                    <X size={16}/>
                  </button>
               </div>
               
               {/* Split-Screen Terminal (Full Screen Fit) */}
               <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                  
                  {/* Left Side: Product Gallery */}
                  <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50">
                    
                    {/* Mobile Only Villa Header */}
                    <div className="md:hidden p-2.5 bg-white border-b border-slate-200">
                      <div className="flex gap-2 items-center">
                        <input 
                          type="text" 
                          placeholder="Villa #" 
                          autoFocus 
                          className="w-20 p-2 bg-slate-50 border-2 border-rose-200 rounded-xl font-mono font-black text-center text-sm text-slate-800 outline-none focus:border-rose-500" 
                          value={villaNumber} 
                          onChange={e => setVillaNumber(e.target.value)}
                        />
                        <input 
                          type="text" 
                          placeholder="VA Name" 
                          className="flex-1 p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-700 outline-none" 
                          value={requesterSearch} 
                          onChange={e => setRequesterSearch(e.target.value)}
                        />
                      </div>
                      <GuestCard />
                    </div>

                    {/* Filter Bar with exact category sequence */}
                    <div className="p-2.5 bg-white border-b border-slate-100 space-y-1.5 shrink-0">
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-2 text-slate-400"/>
                        <input 
                          type="text" 
                          placeholder="Search items (e.g. Beer, Nuts, Coke, Taittinger, etc.)..." 
                          className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-xs text-slate-700 outline-none focus:bg-white focus:border-rose-500" 
                          value={mbItemSearch} 
                          onChange={(e) => setMbItemSearch(e.target.value)}
                        />
                        {mbItemSearch && (
                          <button onClick={() => setMbItemSearch('')} className="absolute right-2.5 top-2 text-slate-400">
                            <X size={12} />
                          </button>
                        )}
                      </div>
                      
                      <div className="flex gap-1 overflow-x-auto no-scrollbar py-0.5">
                        {minibarCats.map(c => (
                          <button 
                            key={c} 
                            onClick={() => setMbCategory(c)} 
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all whitespace-nowrap cursor-pointer ${
                              mbCategory === c ? 'bg-rose-600 text-white shadow-xs' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            }`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Compact Image Grid (Fit on one screen without outer scroll) */}
                    <div className="flex-1 overflow-y-auto p-2.5 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 content-start">
                       {visibleMinibarItems.map(item => {
                          const itemName = item.generic_name || item.article_name;
                          const inCart = mbCart.find(c => c.name === itemName);
                          return (
                            <button 
                              key={item.article_number} 
                              onClick={() => addToCart(itemName, 'MB')} 
                              className={`bg-white p-1.5 rounded-xl border flex flex-col items-center justify-between gap-1 active:scale-95 transition-all group relative cursor-pointer select-none ${
                                inCart 
                                  ? 'border-rose-500 ring-2 ring-rose-100 shadow-sm' 
                                  : 'border-slate-200/70 hover:border-rose-300'
                              }`}
                            >
                               {inCart && (
                                 <div className="absolute top-1 right-1 bg-rose-600 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-xs z-10">
                                   {inCart.qty}
                                 </div>
                               )}
                               <div className="w-full h-12 sm:h-14 bg-slate-50/60 rounded-lg flex items-center justify-center overflow-hidden p-1">
                                   {item.image_url ? (
                                     <img src={item.image_url} alt={itemName} className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"/>
                                   ) : (
                                     <Wine size={16} className="text-rose-200"/>
                                   )}
                               </div>
                               <span className="text-[10px] font-bold text-slate-700 text-center leading-tight line-clamp-2 h-6 flex items-center justify-center">
                                 {itemName}
                                </span>
                            </button>
                          );
                       })}
                    </div>
                  </div>

                  {/* Right Side: Pinned Order Tray & Checkout */}
                  <div className="w-full md:w-80 lg:w-84 bg-white border-t md:border-t-0 md:border-l border-slate-200 flex flex-col shrink-0 max-h-[46vh] md:max-h-none">
                    
                    {/* Desktop Villa Input Box */}
                    <div className="hidden md:block p-3 border-b border-slate-100">
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          placeholder="Villa #" 
                          autoFocus 
                          className="w-20 p-2 bg-slate-50 border-2 border-rose-200 rounded-xl font-mono font-black text-center text-base text-slate-800 outline-none focus:border-rose-500" 
                          value={villaNumber} 
                          onChange={e => setVillaNumber(e.target.value)}
                        />
                        <input 
                          type="text" 
                          placeholder="VA Name" 
                          className="flex-1 p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-700 outline-none focus:border-rose-500" 
                          value={requesterSearch} 
                          onChange={e => setRequesterSearch(e.target.value)}
                        />
                      </div>
                      <GuestCard />
                    </div>

                    {/* Pinned Selection Tray */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">
                          Selected Items ({mbCart.reduce((sum, i) => sum + i.qty, 0)})
                        </span>
                        {mbCart.length > 0 && (
                          <button onClick={() => setMbCart([])} className="text-[9px] font-bold text-rose-500 hover:underline">
                            Clear
                          </button>
                        )}
                      </div>

                      {mbCart.length === 0 ? (
                        <div className="py-6 md:py-16 text-center text-slate-300 text-xs font-bold">
                          Tap product picture to add
                        </div>
                      ) : (
                        mbCart.map(i => (
                          <div key={i.name} className="p-2 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <span className="text-xs font-bold text-slate-800 block truncate leading-tight">{i.name}</span>
                              <button 
                                onClick={() => toggleRefill(i.name)} 
                                className={`mt-0.5 px-1.5 py-0.5 rounded text-[8px] font-black uppercase transition-all cursor-pointer ${
                                  i.isRefill ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'
                                }`}
                              >
                                {i.isRefill ? '✓ Refill' : '+ Refill'}
                              </button>
                            </div>

                            <div className="flex items-center gap-1 bg-white px-1 py-0.5 rounded-lg border border-slate-200 shrink-0">
                              <button 
                                onClick={() => updateCartQty(i.name, -1, 'MB')} 
                                className="w-5 h-5 rounded bg-slate-100 hover:bg-rose-100 hover:text-rose-600 flex items-center justify-center font-black text-slate-600 cursor-pointer"
                              >
                                <Minus size={10}/>
                              </button>
                              <span className="w-5 text-center font-mono font-black text-xs text-slate-800">
                                {i.qty}
                              </span>
                              <button 
                                onClick={() => updateCartQty(i.name, 1, 'MB')} 
                                className="w-5 h-5 rounded bg-slate-100 hover:bg-emerald-100 hover:text-emerald-600 flex items-center justify-center font-black text-slate-600 cursor-pointer"
                              >
                                <Plus size={10}/>
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Bottom Action Footer */}
                    <div className="p-3 border-t border-slate-200 bg-white">
                      <button 
                        onClick={() => submitRequest('Minibar')} 
                        className="w-full py-3 bg-rose-600 hover:bg-rose-700 active:scale-98 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md shadow-rose-600/20 transition-all cursor-pointer"
                      >
                        {isEditing ? 'Confirm Update' : `Save Minibar (${mbCart.reduce((s, i) => s + i.qty, 0)})`}
                      </button>
                    </div>
                  </div>

               </div>
            </div>
         </div>
      )}

      {/* ========================================================================= */}
      {/* GENERAL & GEM REQUEST MODAL                                               */}
      {/* ========================================================================= */}
      {isOtherOpen && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[9999] flex items-end md:items-center justify-center p-0 md:p-4">
            <div className={`bg-white rounded-t-3xl md:rounded-3xl shadow-2xl w-full max-w-4xl h-[90vh] md:h-[82vh] flex flex-col overflow-hidden border border-slate-200 animate-in slide-in-from-bottom-6 md:zoom-in-95 ${otherModalType === 'GEM' ? 'border-t-4 border-t-amber-400' : ''}`}>
               
               <div className="px-5 py-4 flex justify-between items-center border-b border-slate-100 shrink-0">
                  <h3 className={`text-base sm:text-lg font-black flex items-center gap-2 uppercase tracking-tight ${otherModalType === 'GEM' ? 'text-amber-600' : 'text-[#6D2158]'}`}>
                      <Wrench size={20}/> {otherModalType === 'GEM' ? 'GEM Request' : 'General Housekeeping Request'}
                  </h3>
                  <button onClick={() => setIsOtherOpen(false)} className="bg-slate-100 p-2 rounded-full text-slate-500 hover:bg-slate-200 cursor-pointer"><X size={18}/></button>
               </div>

               <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                     <input 
                       type="text" 
                       placeholder="Villa #" 
                       autoFocus 
                       className="col-span-1 p-3 bg-slate-50 border-2 border-slate-200 rounded-xl font-mono font-black text-center text-base text-slate-800 outline-none focus:border-[#6D2158]" 
                       value={villaNumber} 
                       onChange={e => setVillaNumber(e.target.value)}
                     />
                     {otherModalType === 'GEM' ? (
                         <select 
                           className="col-span-2 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-700 outline-none focus:border-amber-500" 
                           value={requesterSearch} 
                           onChange={e => setRequesterSearch(e.target.value)}
                         >
                             <option value="" disabled>Select GEM...</option>
                             {gems.map(g => <option key={g} value={g}>{g}</option>)}
                         </select>
                     ) : (
                         <input 
                           type="text" 
                           placeholder="VA Name / ID" 
                           className="col-span-2 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-700 outline-none focus:border-[#6D2158]" 
                           value={requesterSearch} 
                           onChange={e => setRequesterSearch(e.target.value)}
                         />
                     )}
                     
                     <input 
                       type="time" 
                       className="col-span-3 sm:col-span-1 p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-xs text-center text-slate-700 outline-none" 
                       value={manualTime} 
                       onChange={e => setManualTime(e.target.value)}
                     />
                  </div>
                  
                  <GuestCard />
                  
                  <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1.5 rounded-2xl">
                     <button 
                       onClick={() => setOtherMode('Catalog')} 
                       className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                         otherMode === 'Catalog' ? 'bg-white shadow-xs text-[#6D2158]' : 'text-slate-500'
                       }`}
                     >
                       Visual Catalog ({otherCart.reduce((s, i) => s + i.qty, 0)})
                     </button>
                     <button 
                       onClick={() => setOtherMode('Note')} 
                       className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                         otherMode === 'Note' ? 'bg-white shadow-xs text-[#6D2158]' : 'text-slate-500'
                       }`}
                     >
                       Custom Text / AI Note
                     </button>
                  </div>
                  
                  {otherMode === 'Catalog' ? (
                     <div className="space-y-3">
                        {otherCart.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 p-3 bg-purple-50/60 rounded-2xl border border-purple-100">
                            {otherCart.map(item => (
                              <span key={item.name} className="px-2.5 py-1 bg-[#6D2158] text-white rounded-xl text-xs font-bold flex items-center gap-1.5">
                                {item.qty}x {item.name}
                                <button onClick={() => updateCartQty(item.name, -item.qty, 'Other')} className="hover:text-rose-200 cursor-pointer">
                                  <X size={13}/>
                                </button>
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="relative">
                          <Search size={15} className="absolute left-3.5 top-3 text-slate-400"/>
                          <input 
                            type="text" 
                            placeholder="Search general amenities (Towels, Hangers, Iron, Pillow)..." 
                            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-[#6D2158]"
                            value={otherItemSearch}
                            onChange={e => setOtherItemSearch(e.target.value)}
                          />
                        </div>

                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
                          {masterCatalog
                            .filter(i => !i.is_minibar_item && ((i.article_name || '').toLowerCase().includes(otherItemSearch.toLowerCase()) || (i.generic_name || '').toLowerCase().includes(otherItemSearch.toLowerCase())))
                            .map(item => {
                             const itemName = item.generic_name || item.article_name;
                             const inCart = otherCart.find(c => c.name === itemName);
                             return (
                                 <button 
                                   key={item.article_number} 
                                   onClick={() => addToCart(itemName, 'Other')} 
                                   className={`bg-white p-2.5 rounded-2xl flex flex-col items-center justify-between gap-2 active:scale-95 transition-all group relative border-2 cursor-pointer ${
                                     inCart ? 'border-[#6D2158] shadow-sm ring-2 ring-[#6D2158]/10' : 'border-slate-200/70 hover:border-slate-300'
                                   }`}
                                 >
                                    {inCart && (
                                      <div className="absolute top-1.5 right-1.5 bg-[#6D2158] text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">
                                        {inCart.qty}
                                      </div>
                                    )}
                                    <div className="w-full h-16 bg-slate-50 rounded-xl flex items-center justify-center overflow-hidden p-1.5">
                                      <img src={item.image_url || '/placeholder.png'} alt="" className="w-full h-full object-contain group-hover:scale-110 transition-all"/>
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-700 text-center leading-tight line-clamp-2 h-7 flex items-center">
                                      {itemName}
                                    </span>
                                 </button>
                             );
                          })}
                        </div>
                     </div>
                  ) : (
                     <div className="flex flex-col gap-3">
                         {otherModalType !== 'GEM' && (
                             <select 
                               value={otherCategory} 
                               onChange={e => setOtherCategory(e.target.value)} 
                               className="p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-700 outline-none focus:border-[#6D2158]"
                             >
                                <option value="General">General Request</option>
                                <option value="Cleaning">Cleaning</option>
                                <option value="Maintenance">Maintenance</option>
                                <option value="Amenities">Amenities</option>
                                <option value="Laundry">Laundry</option>
                             </select>
                         )}
                         <div className="relative">
                             <textarea 
                                 rows={6}
                                 className="w-full p-4 pr-14 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs text-slate-700 outline-none focus:bg-white focus:border-[#6D2158] resize-none leading-relaxed" 
                                 placeholder="Paste WhatsApp message or type request notes here..." 
                                 value={customNote} 
                                 onChange={e => setCustomNote(e.target.value)}
                             />
                             <button 
                                 onClick={handleMagicFormat} 
                                 disabled={isMagicLoading || !customNote}
                                 title="Magic Format (AI)" 
                                 className="absolute top-3 right-3 p-2.5 bg-[#6D2158]/10 hover:bg-[#6D2158]/20 text-[#6D2158] rounded-xl active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
                             >
                                 {isMagicLoading ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} />}
                             </button>
                         </div>
                     </div>
                  )}
               </div>

               <div className="p-4 bg-white border-t border-slate-100 pb-6 md:pb-4 shrink-0">
                  <button 
                    onClick={() => submitRequest('Other')} 
                    className={`w-full py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider text-white shadow-lg transition-all cursor-pointer ${
                      otherModalType === 'GEM' 
                        ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20' 
                        : 'bg-[#6D2158] hover:bg-[#5a1b49] shadow-[#6D2158]/20'
                    }`}
                  >
                      {isEditing ? 'Confirm Update' : 'Save Request'}
                  </button>
               </div>
            </div>
         </div>
      )}

      {/* PARTIAL DISPATCH MODAL */}
      {isPartialOpen && partialTarget && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4">
              <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm p-6 pb-8 sm:pb-6 shadow-2xl animate-in slide-in-from-bottom-6 sm:zoom-in-95">
                  <h3 className="text-lg font-black text-slate-800 mb-1 flex items-center justify-center gap-2 uppercase tracking-tight">
                    <Split size={18}/> Partial Dispatch (V{partialTarget.villa_number})
                  </h3>
                  <p className="text-[11px] font-bold text-slate-400 mb-5 text-center">
                    Select items that have been <b>SENT</b>
                  </p>
                  
                  <div className="space-y-2 mb-6 max-h-64 overflow-y-auto">
                      {(partialTarget.item_details || '').split(/\n/).map((item, i) => {
                          const cleanItem = item.trim().replace(/^[•\-\*]\s*/, '');
                          if (!cleanItem) return null;
                          
                          const baseItem = cleanItem.replace(/\s*\(SENT\)$/, '');
                          const isSelected = partialSelection.includes(baseItem);
                          
                          return (
                              <button 
                                key={i} 
                                onClick={() => isSelected ? setPartialSelection(partialSelection.filter(x => x !== baseItem)) : setPartialSelection([...partialSelection, baseItem])}
                                className={`w-full p-3.5 rounded-xl flex items-center justify-between border-2 font-bold text-xs transition-all cursor-pointer ${
                                  isSelected ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-600'
                                }`}
                              >
                                  <span>{baseItem}</span>
                                  {isSelected ? <CheckCircle2 size={18} className="text-blue-600"/> : <div className="w-4 h-4 rounded-full border-2 border-slate-300"/>}
                              </button>
                          );
                      })}
                  </div>
                  
                  <div className="flex gap-2">
                    <button onClick={() => setIsPartialOpen(false)} className="flex-1 py-3 text-slate-500 bg-slate-100 rounded-xl font-bold text-xs uppercase hover:bg-slate-200 cursor-pointer">
                      Cancel
                    </button>
                    <button onClick={submitPartial} className="flex-1 py-3 text-xs font-black uppercase bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md cursor-pointer">
                      Save Dispatch
                    </button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
}
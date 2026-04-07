"use client";
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, Plus, X, Wine, Wrench, Trash2, 
  Calendar, Split, Send, Check, Clock, Edit3, Wand2, Loader2, 
  CheckCircle2, AlertTriangle, User, MessageCircle
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

// --- BULLETPROOF COMMA PARSER ---
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
              // FIX: Only use nicknames and full_name (no nickname singular)
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
                      // FIX: Removed the singular nickname to match the typescript request
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
                if (otherModalType === 'GEM') setRequesterSearch(data.gem_name || '');
                else setRequesterSearch(assignedVA || '');
            }
          } else { 
            setGuestInfo(null); 
            if (!isEditing) {
                if (otherModalType !== 'GEM') setRequesterSearch(assignedVA || '');
                else setRequesterSearch('');
            }
          }
      } else {
          setGuestInfo(null);
          if (!isEditing) {
              if (otherModalType !== 'GEM') setRequesterSearch(assignedVA || '');
              else setRequesterSearch('');
          }
      }
    };
    
    const timer = setTimeout(fetchGuestAndVA, 300);
    return () => clearTimeout(timer);
  }, [villaNumber, otherModalType, selectedDate, isMinibarOpen, dailyAllocations, allHosts, hostMap, isEditing]);

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
      if(items.length === 0) return false;
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
    
    setVillaNumber(''); setGuestInfo(null); setMbCart([]); setOtherCart([]); setCustomNote(''); setRequesterSearch(''); setMbItemSearch('');
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
        // Strip out the inline SENT tags so they can cleanly edit the items
        const cleanLine = line.replace(/\s*\(SENT\)$/, '');
        const match = cleanLine.match(/(\d+)x (.+)/);
        const isRef = cleanLine.includes('(Refill)');
        let n = match ? match[2] : cleanLine;
        if(isRef) n = n.replace(' (Refill)', '');
        return { name: n.trim(), qty: match ? parseInt(match[1]) : 1, isRefill: isRef };
      });
      setMbCart(items);
      setIsMinibarOpen(true);
    } else {
      // Strip SENT tags from general requests too
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
    } catch (err) {
        let v = "";
        const vMatch = customNote.match(/villa\s*(\d{1,3})/i);
        if(vMatch) v = vMatch[1];

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
        details = mbCart.map(i => `${i.qty}x ${i.name}${i.isRefill ? ' (Refill)' : ''}`).join('\n');
        reqType = 'Minibar';
    } else {
        details = otherMode === 'Catalog' ? otherCart.map(i => `${i.qty}x ${i.name}`).join('\n') : customNote;
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

    // FIX: Removed the singular nickname to match the typescript request
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
        toast.error("Error saving. Did you add the 'logged_by' text column to hsk_daily_requests?");
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
      // Formats the message cleanly for WhatsApp, swapping inline tags for emojis
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
      // Extract all items, pulling out the ones that already have the (SENT) tag
      const allItemsRaw = (record.item_details || '').split(/\n/).map(s => s.trim().replace(/^[•\-\*]\s*/, '')).filter(Boolean);
      const alreadySent = allItemsRaw.filter(i => i.endsWith('(SENT)')).map(i => i.replace(/\s*\(SENT\)$/, ''));
      setPartialSelection(alreadySent);
      setIsPartialOpen(true);
  };

  const submitPartial = async () => {
      if (!partialTarget) return;
      
      const allItemsRaw = (partialTarget.item_details || '').split(/\n/).map(s => s.trim().replace(/^[•\-\*]\s*/, '')).filter(Boolean);
      
      // Inline Tagging: Append (SENT) to the selected items
      const updatedItems = allItemsRaw.map(item => {
          const baseItem = item.replace(/\s*\(SENT\)$/, '');
          if (partialSelection.includes(baseItem)) {
              return `${baseItem} (SENT)`;
          }
          return baseItem;
      });
      
      // If every single item has the (SENT) tag, mark the whole card as is_sent
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
      
      if (villaSearch && !r.villa_number.toLowerCase().includes(villaSearch.toLowerCase())) return false;
      if (jettyFilter === 'Jetty A' && !(vNum >= 1 && vNum <= 35)) return false;
      if (jettyFilter === 'Jetty B' && !(vNum >= 37 && vNum <= 50)) return false;
      if (jettyFilter === 'Jetty C' && !(vNum >= 59 && vNum <= 79)) return false;
      if (jettyFilter === 'Beach' && ((vNum >= 1 && vNum <= 35) || (vNum >= 37 && vNum <= 50) || (vNum >= 59 && vNum <= 79))) return false;
      return true;
  });

  const minibarItems = masterCatalog.filter(i => i.is_minibar_item);
  const minibarCats = ['All', ...Array.from(new Set(minibarItems.map(i => i.category))) as string[]];

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
        <div className={`mt-3 p-4 rounded-2xl border-l-4 shadow-sm animate-in zoom-in-95 ${guestInfo.isCheckout ? 'bg-rose-50 border-rose-500' : 'bg-blue-50 border-blue-500'}`}>
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><User size={14} className="text-slate-400"/>{guestInfo.mainName || 'Guest'}</h3>
                    <p className="text-[10px] text-slate-500 font-bold mt-1 tracking-wide">
                        Dep: <span className="text-slate-800">{depDate}</span>
                    </p>
                </div>
                <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border bg-white ${guestInfo.pkg?.color || 'border-slate-200 text-slate-500'}`}>
                    {mealPlan}
                </span>
            </div>
            {guestInfo.isCheckout && <div className="mt-2 flex items-center gap-1 text-rose-600 font-black text-[10px] uppercase tracking-widest"><AlertTriangle size={12}/> Checkout Today</div>}
        </div>
      );
  };

  return (
    <div className="flex flex-col min-h-full bg-slate-50 font-sans text-slate-800">
      
      <PageHeader 
        title="Request Log"
        date={selectedDate}
        onDateChange={setSelectedDate}
        actions={
          <div className="flex gap-2 overflow-x-auto no-scrollbar w-full md:w-auto">
            <button onClick={() => handleOpenModal('Minibar')} className="btn-danger !px-4 !py-2.5">Minibar</button>
            <button onClick={() => handleOpenModal('General')} className="btn-primary !px-4 !py-2.5">Gen Req</button>
            <button onClick={() => handleOpenModal('GEM')} className="btn-primary !bg-amber-500 !shadow-amber-500/20 hover:!bg-amber-600 !px-4 !py-2.5 text-white">GEM Req</button>
          </div>
        }
      />

      <div className="px-3 sm:px-4 mt-2 mb-2">
        <div className="relative mt-2">
            <Search size={16} className="absolute left-4 top-4 text-slate-400" />
            <input type="text" placeholder="Search Villa or Name..." className="input-field pl-12 py-3 text-[16px] md:text-sm" value={villaSearch} onChange={e => setVillaSearch(e.target.value)}/>
        </div>

        <div className="flex flex-col gap-2.5 mt-3">
            <div className="flex gap-2 flex-wrap items-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase w-10 shrink-0">Type</span>
                {['All', 'Minibar', 'General', 'GEM'].map(t => (
                    <button key={t} onClick={() => setTypeFilter(t)} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase transition-all whitespace-nowrap active:scale-95 ${typeFilter === t ? 'bg-slate-800 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-400'}`}>{t}</button>
                ))}
            </div>
            <div className="flex gap-2 flex-wrap items-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase w-10 shrink-0">State</span>
                {getAvailableStatuses().map(f => (
                    <button key={f} onClick={() => setStatusFilter(f)} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase transition-all whitespace-nowrap active:scale-95 ${statusFilter === f ? 'bg-[#6D2158] text-white shadow-md shadow-[#6D2158]/20' : 'bg-white border border-slate-200 text-slate-500 hover:border-[#6D2158]'}`}>{f}</button>
                ))}
            </div>
            <div className="flex gap-2 flex-wrap items-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase w-10 shrink-0">Zone</span>
                {['All', 'Jetty A', 'Jetty B', 'Jetty C', 'Beach'].map(j => (
                    <button key={j} onClick={() => setJettyFilter(j)} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase transition-all whitespace-nowrap active:scale-95 ${jettyFilter === j ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'bg-white border border-slate-200 text-slate-500 hover:border-blue-600'}`}>{j}</button>
                ))}
                <div className="border-l border-slate-200 pl-3 ml-1 h-6 flex items-center">
                    <button onClick={() => setShowOverdue(!showOverdue)} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase transition-all whitespace-nowrap active:scale-95 ${showOverdue ? 'bg-rose-50 text-rose-600 border border-rose-200 shadow-sm' : 'bg-white border border-slate-200 text-slate-400'}`}>
                        {showOverdue ? 'Hide Overdue' : 'Show Overdue'}
                    </button>
                </div>
            </div>
        </div>
      </div>

      <div className="p-2 sm:p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4 pb-32">
         {visibleRecords.map(r => {
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
             <div key={r.id} className={`card-standard p-0 overflow-hidden transition-all ${isCompleted ? 'opacity-80 bg-slate-50 border-slate-300 shadow-none' : isUrgent ? 'border-rose-400 ring-4 ring-rose-50' : r.request_type === 'Minibar' ? 'border-rose-100' : isGemReq ? 'border-amber-200' : 'border-slate-200'}`}>
                
                {isPreviousDay && !isCompleted && (
                    <div className="bg-rose-600 text-white text-[9px] sm:text-[10px] font-black px-2 py-1 w-full text-center tracking-widest uppercase flex items-center justify-center gap-1 shadow-sm">
                        <AlertTriangle size={10} /> Overdue (From {pastDateStr})
                    </div>
                )}

                <div className="p-3 sm:p-5 flex flex-col h-full">
                    <div className="flex justify-between items-start mb-2">
                       <div className="flex flex-col gap-1">
                           <div className="flex items-center gap-1">
                             <span className="text-lg sm:text-2xl font-black text-slate-800 tracking-tight leading-none break-all">{r.villa_number}</span>
                             <button onClick={() => handleEditRecord(r)} className="p-1 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors shrink-0" title="Edit"><Edit3 size={14}/></button>
                           </div>
                           
                           <div className="flex items-center gap-1 flex-wrap">
                               {mealPlan && <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-md text-[8px] sm:text-[9px] font-black uppercase border border-slate-200">{mealPlan}</span>}
                               {depDate && <span className={`px-1.5 py-0.5 rounded-md text-[8px] sm:text-[9px] font-black uppercase border ${isCheckout ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>Dep: {depDate}</span>}
                           </div>
                       </div>

                       <div className={`px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-xl text-[8px] sm:text-[9px] font-black uppercase tracking-wider shrink-0 shadow-sm ${r.request_type === 'Minibar' ? 'bg-rose-50 text-rose-600 border border-rose-100' : isGemReq ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                           {r.request_type === 'General Request' ? 'Gen Req' : r.request_type}
                       </div>
                    </div>
                    
                    <div className="mb-3 text-[11px] sm:text-sm font-bold text-slate-600 leading-tight space-y-0.5">
                        {(r.item_details || '').split(/\n/).map((item: string, idx: number) => {
                            const cleanItem = item.trim().replace(/^[•\-\*]\s*/, '');
                            if (!cleanItem) return null;
                            
                            const isSentItem = cleanItem.endsWith('(SENT)');
                            const displayText = cleanItem.replace(/\s*\(SENT\)$/, '');
                            
                            return (
                                <div key={idx} className={`flex items-center gap-1.5 ${isSentItem ? 'text-slate-400 line-through' : ''}`}>
                                    <span>• {displayText}</span>
                                    {isSentItem && <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />}
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-auto pt-3 border-t border-slate-50 flex flex-col xl:flex-row justify-between items-start xl:items-end gap-2">
                       <div className="w-full xl:w-auto">
                          <div className="text-[9px] sm:text-[10px] text-slate-400 font-black uppercase">{r.attendant_name}</div>
                          
                          <div className={`text-[9px] sm:text-[10px] font-bold mt-0.5 flex flex-wrap items-center gap-1 ${isUrgent ? 'text-rose-600 animate-pulse' : 'text-slate-400'}`}>
                              <span className="flex items-center whitespace-nowrap">
                                  <Clock size={10} className="inline mr-1 -mt-0.5"/>
                                  {formatDisplayTime(r.request_time)} 
                              </span>
                              <span className={`whitespace-nowrap px-1.5 py-0.5 rounded text-[8px] uppercase tracking-widest ${isUrgent ? 'bg-rose-100 font-black' : 'bg-slate-100'}`}>
                                  {timeStr}
                              </span>
                          </div>

                          {r.chk_number && <div className="text-[9px] sm:text-[10px] text-[#6D2158] font-black mt-1">CHK: {r.chk_number}</div>}
                          {r.logged_by && <div className="text-[8px] text-slate-300 font-bold uppercase mt-1">Log: {r.logged_by}</div>}
                       </div>
                       
                       <div className="flex gap-1.5 flex-wrap justify-end w-full xl:w-auto">
                         {r.request_type === 'Minibar' ? (
                             <>
                                 <button onClick={() => openPartialModal(r)} className="p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl bg-slate-50 text-slate-400 hover:text-slate-600 active:scale-90 transition-transform" title="Split"><Split size={14}/></button>
                                 <button onClick={() => toggleStatus(r.id, 'is_sent')} className={`p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl active:scale-90 transition-all ${r.is_sent ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'bg-slate-100 text-slate-400 hover:bg-blue-50 hover:text-blue-600'}`} title="Sent"><Send size={14}/></button>
                                 
                                 {!allRefill && (
                                     <button onClick={() => handleOpenPost(r)} className={`p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl active:scale-90 transition-all ${r.is_posted ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20' : 'bg-slate-100 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600'}`} title={r.is_posted ? "Edit Bill" : "Post to Guest"}>
                                         <Check size={14}/>
                                     </button>
                                 )}
                             </>
                         ) : (
                             <>
                                 <button onClick={() => handleWhatsApp(r, 'inform')} className="p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 active:scale-90 transition-transform" title="WhatsApp Inform">
                                     <MessageCircle size={14} />
                                 </button>
                                 <button onClick={() => toggleStatus(r.id, 'is_sent')} className={`p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl active:scale-90 transition-all ${r.is_sent ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'bg-slate-100 text-slate-400 hover:text-blue-500'}`} title={r.is_sent ? 'Informed' : 'Inform'}>
                                     <Send size={14}/>
                                 </button>

                                 <button onClick={() => handleWhatsApp(r, 'done')} className="p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 active:scale-90 transition-transform flex items-center gap-0.5" title="WhatsApp Done">
                                     <MessageCircle size={14}/><Check size={10} strokeWidth={4}/>
                                 </button>
                                 <button onClick={() => toggleStatus(r.id, 'is_done')} className={`p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl active:scale-90 transition-all ${r.is_done ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20' : 'bg-slate-100 text-slate-400 hover:text-emerald-500'}`} title="Done">
                                     <Check size={14}/>
                                 </button>
                             </>
                         )}
                         <button onClick={() => askDelete(r.id)} className="p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl text-slate-300 hover:bg-rose-50 hover:text-rose-500 active:scale-90 transition-all"><Trash2 size={14}/></button>
                       </div>
                    </div>
                </div>
             </div>
             )
         })}
      </div>

      {postModal.isOpen && (
          <div className="modal-overlay !z-[9999]">
              <div className="modal-content">
                  <h3 className="text-2xl font-black text-[#6D2158] text-center mb-1 uppercase tracking-tight">Post Bill</h3>
                  <p className="text-[10px] font-bold text-slate-400 text-center mb-6 uppercase tracking-widest">Confirm CHK Number</p>
                  
                  <input 
                      type="number" 
                      className="input-field text-center text-4xl mb-6 py-6"
                      value={postModal.chk}
                      onChange={e => setPostModal({...postModal, chk: e.target.value})}
                      autoFocus
                  />

                  <div className="flex flex-col gap-3">
                      <button onClick={confirmPost} className="btn-primary w-full py-5">Link Bill & Post</button>
                      <button onClick={() => setPostModal({isOpen: false, id: '', chk: ''})} className="w-full py-5 bg-slate-50 text-slate-500 rounded-3xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all hover:bg-slate-100">Cancel</button>
                  </div>
              </div>
          </div>
      )}

      {isMinibarOpen && (
         <div className="bottom-sheet-overlay !z-[9999]">
            <div className="bottom-sheet-content flex flex-col h-[90vh]">
               <div className="drag-handle"></div>
               
               <div className="px-6 py-4 flex justify-between items-center border-b border-slate-100 shrink-0">
                  <h3 className="text-xl font-black text-rose-700 tracking-tight flex items-center gap-2">
                      <Wine size={20}/> {isEditing ? 'Edit Entry' : 'Minibar Log'}
                  </h3>
                  <button onClick={() => setIsMinibarOpen(false)} className="bg-slate-100 p-2 rounded-full text-slate-500 active:scale-90 transition-transform"><X size={20}/></button>
               </div>
               
               <div className="flex-1 overflow-y-auto p-6 pb-6 custom-scrollbar">
                  <div className="flex gap-3 mb-4 items-center">
                     <input type="text" placeholder="Villa" autoFocus className="input-field w-20 text-center text-xl text-[16px] md:text-sm" value={villaNumber} onChange={e => setVillaNumber(e.target.value)}/>
                     <div className="flex-1 relative">
                         <input type="text" placeholder="VA Name (e.g. Ali)" className="input-field w-full text-[16px] md:text-sm" value={requesterSearch} onChange={e => setRequesterSearch(e.target.value)}/>
                     </div>
                  </div>
                  
                  <GuestCard />
                  
                  {mbCart.length > 0 && (
                     <div className="mt-4 p-4 bg-white rounded-3xl border-2 border-rose-50 flex flex-wrap gap-2 animate-in zoom-in-95 shadow-sm">
                        {mbCart.map(i => (
                           <div key={i.name} className="flex items-center gap-0.5">
                             <button onClick={() => toggleRefill(i.name)} className={`px-2.5 py-2 rounded-l-xl text-[10px] font-black uppercase transition-all ${i.isRefill ? 'bg-blue-600 text-white shadow-md shadow-blue-100' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>Refill</button>
                             <button onClick={() => setMbCart(mbCart.filter(c => c.name !== i.name))} className={`px-3 py-2 rounded-r-xl text-xs font-black flex items-center gap-1 active:scale-95 transition-all ${i.isRefill ? 'bg-blue-50 text-blue-700 border-2 border-blue-100' : 'bg-rose-600 text-white shadow-md hover:bg-rose-700'}`}>{i.qty} {i.name} <X size={14}/></button>
                           </div>
                        ))}
                     </div>
                  )}

                  <div className="relative mt-6 mb-3">
                      <Search size={16} className="absolute left-4 top-4 text-slate-400"/>
                      <input type="text" placeholder="Find Item..." className="input-field pl-12 text-[16px] md:text-sm" value={mbItemSearch} onChange={(e) => setMbItemSearch(e.target.value)}/>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 mb-6 overflow-x-auto no-scrollbar pb-2">
                      {minibarCats.map(c => (
                          <button key={c} onClick={() => setMbCategory(c)} className={`px-4 py-2 rounded-full text-[10px] font-bold uppercase transition-all shadow-sm active:scale-95 ${mbCategory === c ? 'bg-rose-600 text-white border-rose-600' : 'bg-white border border-slate-200 text-slate-500 hover:border-rose-300'}`}>{c}</button>
                      ))}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                     {masterCatalog.filter(i => i.is_minibar_item).filter(i => (mbCategory === 'All' || i.category === mbCategory) && (i.article_name.toLowerCase().includes(mbItemSearch.toLowerCase()) || (i.generic_name || "").toLowerCase().includes(mbItemSearch.toLowerCase()))).map(item => {
                        const inCart = mbCart.find(c => c.name === (item.generic_name || item.article_name));
                        return (
                        <button key={item.article_number} onClick={() => addToCart(item.generic_name || item.article_name, 'MB')} className={`bg-white p-3 rounded-3xl border-2 flex flex-col items-center gap-3 active:scale-95 transition-transform overflow-hidden group relative ${inCart ? 'border-rose-500 ring-4 ring-rose-100 shadow-md' : 'border-slate-100 hover:border-rose-200'}`}>
                           {inCart && <div className="absolute top-2 right-2 bg-rose-500 text-white text-xs font-black px-2 py-0.5 rounded-full animate-in zoom-in">{inCart.qty}</div>}
                           <div className="w-full aspect-square bg-slate-50 rounded-2xl flex items-center justify-center overflow-hidden h-20 sm:h-24">
                               {item.image_url ? <img src={item.image_url} alt="" className="w-full h-full object-contain p-2 group-hover:scale-110 transition-transform duration-500"/> : <Wine size={20} className="text-rose-200"/>}
                           </div>
                           <span className="text-[11px] font-bold text-slate-700 text-center leading-tight line-clamp-2 h-8 flex items-center">{item.generic_name || item.article_name}</span>
                        </button>
                     )})}
                  </div>
               </div>
               
               <div className="p-4 bg-white/95 backdrop-blur-xl border-t border-slate-100 pb-28 md:pb-6 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] sm:rounded-b-[2.5rem] mt-auto w-full z-20 shrink-0">
                  <button onClick={() => submitRequest('Minibar')} className="btn-danger w-full py-5 text-sm font-black shadow-xl">
                      {isEditing ? 'Confirm Update' : 'Save To Log'}
                  </button>
               </div>
            </div>
         </div>
      )}

      {isOtherOpen && (
         <div className="bottom-sheet-overlay !z-[9999]">
            <div className={`bottom-sheet-content flex flex-col h-[90vh] ${otherModalType === 'GEM' ? 'border-t-4 border-amber-400' : ''}`}>
               <div className="drag-handle"></div>

               <div className="px-6 py-4 flex justify-between items-center border-b border-slate-100 shrink-0">
                  <h3 className={`text-xl font-black flex items-center gap-2 uppercase tracking-tight ${otherModalType === 'GEM' ? 'text-amber-600' : 'text-[#6D2158]'}`}>
                      <Wrench size={24}/> {otherModalType === 'GEM' ? 'GEM Request' : 'General Request'}
                  </h3>
                  <button onClick={() => setIsOtherOpen(false)} className="bg-slate-100 p-2 rounded-full text-slate-500 active:scale-90 transition-transform"><X size={20}/></button>
               </div>

               <div className="flex-1 overflow-y-auto p-6 pb-6 custom-scrollbar">
                  <div className="flex gap-3 mb-4">
                     <input type="text" placeholder="Villa" autoFocus className="input-field w-24 text-center text-xl text-[16px] md:text-sm" value={villaNumber} onChange={e => setVillaNumber(e.target.value)}/>
                     {otherModalType === 'GEM' ? (
                         <select className="input-field flex-1 text-[16px] md:text-sm focus:border-amber-500" value={requesterSearch} onChange={e => setRequesterSearch(e.target.value)}>
                             <option value="" disabled>Select GEM...</option>
                             {gems.map(g => <option key={g} value={g}>{g}</option>)}
                         </select>
                     ) : (
                         <input type="text" placeholder="VA Name / ID" className="input-field flex-1 text-[16px] md:text-sm" value={requesterSearch} onChange={e => setRequesterSearch(e.target.value)}/>
                     )}
                     
                     <input type="time" className="input-field w-28 text-center text-[16px] md:text-sm" value={manualTime} onChange={e => setManualTime(e.target.value)}/>
                  </div>
                  
                  <GuestCard />
                  
                  <div className="flex bg-slate-200 p-1.5 rounded-2xl mb-6 mt-6 shrink-0">
                     <button onClick={() => setOtherMode('Catalog')} className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${otherMode === 'Catalog' ? 'bg-white shadow text-[#6D2158]' : 'text-slate-500'}`}>Items</button>
                     <button onClick={() => setOtherMode('Note')} className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${otherMode === 'Note' ? 'bg-white shadow text-[#6D2158]' : 'text-slate-500'}`}>Note</button>
                  </div>
                  
                  {otherMode === 'Catalog' ? (
                     <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {masterCatalog.filter(i => !i.is_minibar_item).map(item => {
                           const inCart = otherCart.find(c => c.name === (item.generic_name || item.article_name));
                           return (
                               <button key={item.article_number} onClick={() => addToCart(item.generic_name || item.article_name, 'Other')} className={`bg-white p-3 rounded-3xl flex flex-col items-center gap-2 active:scale-95 transition-all overflow-hidden group relative border-2 ${inCart ? 'border-[#6D2158] shadow-md ring-4 ring-[#6D2158]/10' : 'border-slate-100 hover:border-slate-200'}`}>
                                  {inCart && <div className="absolute top-1 right-1 bg-[#6D2158] text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-in zoom-in">{inCart.qty}</div>}
                                  <div className="w-full aspect-square bg-slate-50 rounded-[1.2rem] flex items-center justify-center overflow-hidden h-16"><img src={item.image_url || '/placeholder.png'} alt="" className="w-full h-full object-contain p-2 group-hover:scale-110 transition-all"/></div>
                                  <span className="text-[10px] font-bold text-slate-700 text-center leading-tight line-clamp-2 h-8 flex items-center">{item.generic_name || item.article_name}</span>
                               </button>
                           )
                        })}
                     </div>
                  ) : (
                     <div className="flex flex-col gap-4 h-full pb-6">
                         {otherModalType !== 'GEM' && (
                             <select value={otherCategory} onChange={e => setOtherCategory(e.target.value)} className="input-field text-[16px] md:text-sm">
                                <option value="General">General Request</option>
                                <option value="Cleaning">Cleaning</option>
                                <option value="Maintenance">Maintenance</option>
                                <option value="Amenities">Amenities</option>
                                <option value="Laundry">Laundry</option>
                             </select>
                         )}
                         <div className="relative flex-1 min-h-[200px]">
                             <textarea 
                                 className="input-field h-full pr-14 resize-none leading-relaxed text-[16px] md:text-sm" 
                                 placeholder="Paste your long request message here..." 
                                 value={customNote} 
                                 onChange={e => setCustomNote(e.target.value)}
                             />
                             <button 
                                 onClick={handleMagicFormat} 
                                 disabled={isMagicLoading || !customNote}
                                 title="Magic Format (AI)" 
                                 className="absolute top-4 right-4 p-3 bg-[#6D2158]/10 text-[#6D2158] rounded-xl active:scale-95 transition-all shadow-sm disabled:opacity-50 flex items-center justify-center"
                             >
                                 {isMagicLoading ? <Loader2 className="animate-spin" size={20} /> : <Wand2 size={20} />}
                             </button>
                         </div>
                     </div>
                  )}
               </div>

               <div className="p-4 bg-white/95 backdrop-blur-xl border-t border-slate-100 pb-28 md:pb-6 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] sm:rounded-b-[2.5rem] mt-auto w-full z-20 shrink-0">
                  <button onClick={() => submitRequest('Other')} className={`btn-primary w-full py-5 text-sm font-black shadow-xl ${otherModalType === 'GEM' ? '!bg-amber-500 !shadow-amber-500/20 hover:!bg-amber-600' : ''}`}>
                      {isEditing ? 'Confirm Update' : 'Save Request'}
                  </button>
               </div>
            </div>
         </div>
      )}

      {isPartialOpen && partialTarget && (
          <div className="bottom-sheet-overlay !z-[9999]">
              <div className="bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] w-full max-w-sm p-8 pb-28 md:pb-8 shadow-2xl animate-in slide-in-from-bottom-full duration-300 mt-auto sm:mt-0">
                  <div className="drag-handle mb-6"></div>
                  
                  <h3 className="text-2xl font-black text-slate-800 mb-2 flex items-center justify-center gap-2 uppercase tracking-tight"><Split size={24}/> Partial Send</h3>
                  <p className="text-xs font-bold text-slate-400 mb-8 uppercase text-center">Select items to mark as <b>SENT</b>.</p>
                  
                  <div className="space-y-3 mb-8">
                      {/* INLINE TAGGING: Ensure the modal buttons reflect the base item cleanly */}
                      {(partialTarget.item_details || '').split(/\n/).map((item, i) => {
                          const cleanItem = item.trim().replace(/^[•\-\*]\s*/, '');
                          if (!cleanItem) return null;
                          
                          const baseItem = cleanItem.replace(/\s*\(SENT\)$/, '');
                          const isSelected = partialSelection.includes(baseItem);
                          
                          return (
                              <button key={i} onClick={() => isSelected ? setPartialSelection(partialSelection.filter(x => x !== baseItem)) : setPartialSelection([...partialSelection, baseItem])}
                                className={`w-full p-4 rounded-2xl flex items-center justify-between border-2 font-bold text-sm transition-all active:scale-95 ${isSelected ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-slate-50 border-transparent text-slate-500'}`}>
                                  {baseItem} 
                                  {isSelected ? <CheckCircle2 size={20} className="text-blue-600"/> : <div className="w-5 h-5 rounded-full border-2 border-slate-300"/>}
                              </button>
                          )})}
                  </div>
                  
                  <button onClick={submitPartial} className="btn-primary w-full py-5 text-sm !bg-blue-600 hover:!bg-blue-700 !shadow-blue-600/20 mb-3">Confirm Dispatch</button>
                  <button onClick={() => setIsPartialOpen(false)} className="w-full py-5 text-slate-400 bg-slate-50 rounded-[1.5rem] font-black text-sm uppercase active:scale-95 transition-transform hover:bg-slate-100">Cancel</button>
              </div>
          </div>
      )}

    </div>
  );
}
"use client";
import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Plus, X, Wine, Wrench, Trash2, 
  Coffee, Droplet, Cookie, Beer, Zap,
  Calendar, UtensilsCrossed, Cloud, Baby, Box, List, 
  CheckCircle2, ArrowUpDown, Clock, MapPin, Send, Split,
  MoreHorizontal, AlertCircle, Check, User, AlertTriangle, Anchor, Edit3, Trash, Wand2, Loader2
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// --- CONFIG ---
const ICON_MAP: any = {
  'Coffee': Coffee, 'Droplet': Droplet, 'Beer': Beer, 
  'Wine': Wine, 'Cookie': Cookie, 'Zap': Zap,
  'Utensils': UtensilsCrossed, 'Cloud': Cloud, 'Baby': Baby
};

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
};

type MasterItem = {
  article_number: string;
  article_name: string;
  generic_name?: string; 
  category: string;
  is_minibar_item: boolean;
  micros_name?: string;
  icon?: string;
  image_url?: string; 
};

// --- HELPERS ---
const getTodayStr = (dateObj: Date = new Date()) => {
  const tz = typeof window !== 'undefined' ? localStorage.getItem('hk_pulse_timezone') || 'Indian/Maldives' : 'Indian/Maldives';
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(dateObj);
};

const formatLocalTime = (dateStr: string) => {
    const tz = typeof window !== 'undefined' ? localStorage.getItem('hk_pulse_timezone') || 'Indian/Maldives' : 'Indian/Maldives';
    return new Date(dateStr).toLocaleTimeString('en-US', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
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

export default function CoordinatorLog() {
  const [records, setRecords] = useState<RequestRecord[]>([]);
  const [masterCatalog, setMasterCatalog] = useState<MasterItem[]>([]);
  const [requesters, setRequesters] = useState<string[]>([]);
  const [gems, setGems] = useState<string[]>([]);
  
  // UI State
  const [isMinibarOpen, setIsMinibarOpen] = useState(false);
  const [isOtherOpen, setIsOtherOpen] = useState(false);
  const [otherModalType, setOtherModalType] = useState<'General' | 'GEM'>('General');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isPartialOpen, setIsPartialOpen] = useState(false);

  // EDIT & CUSTOM PROMPT STATE
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; id: string | null; title: string; message: string }>({
      isOpen: false, id: null, title: '', message: ''
  });
  
  // POST / BILL NUMBER MODAL
  const [postModal, setPostModal] = useState({ isOpen: false, id: '', chk: '' });
  
  const [toastMsg, setToastMsg] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  // FILTERS
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [jettyFilter, setJettyFilter] = useState('All');
  const [villaSearch, setVillaSearch] = useState('');
  
  const [mbItemSearch, setMbItemSearch] = useState('');
  const [villaNumber, setVillaNumber] = useState('');
  const [guestInfo, setGuestInfo] = useState<any>(null); 
  const [manualTime, setManualTime] = useState('');
  const [requesterSearch, setRequesterSearch] = useState('');
  
  // MINIBAR LOGIC
  const [mbCart, setMbCart] = useState<{name: string, qty: number, isRefill?: boolean}[]>([]);
  const [mbCategory, setMbCategory] = useState('All');
  
  const [otherMode, setOtherMode] = useState<'Catalog' | 'Note'>('Catalog');
  const [otherCategory, setOtherCategory] = useState('General');
  const [otherCart, setOtherCart] = useState<{name: string, qty: number}[]>([]);
  const [customNote, setCustomNote] = useState('');
  const [isMagicLoading, setIsMagicLoading] = useState(false);

  const [partialTarget, setPartialTarget] = useState<RequestRecord | null>(null);
  const [partialSelection, setPartialSelection] = useState<string[]>([]);

  useEffect(() => { fetchRecords(); fetchCatalog(); fetchSettings(); }, [selectedDate]);

  // SMART FILTER UPDATE LOGIC
  const getAvailableStatuses = () => {
      if (typeFilter === 'Minibar') return ['All', 'Unsent', 'Unposted', 'Done'];
      if (typeFilter === 'General' || typeFilter === 'GEM') return ['All', 'Pending', 'Done'];
      return ['All', 'Unsent', 'Unposted', 'Pending', 'Done'];
  };

  useEffect(() => {
      const validStatuses = getAvailableStatuses();
      if (!validStatuses.includes(statusFilter)) {
          setStatusFilter('All');
      }
  }, [typeFilter]);

  useEffect(() => {
    const fetchGuest = async () => {
      if (!villaNumber || villaNumber.length < 1) { setGuestInfo(null); return; }
      
      // If user typed a pure number, try to fetch guest data
      if (/^\d+$/.test(villaNumber)) {
          const { data } = await supabase.from('hsk_daily_summary').select('*').eq('report_date', getTodayStr(selectedDate)).eq('villa_number', villaNumber).maybeSingle();
          if (data) {
            setGuestInfo({ ...data, mainName: extractMainGuest(data.guest_name), pkg: analyzePackage(data.meal_plan), isCheckout: data.status.includes('DEP') });
            if(data.gem_name && !requesterSearch && otherModalType !== 'GEM') setRequesterSearch(data.gem_name);
          } else { setGuestInfo(null); }
      } else {
          setGuestInfo(null); // It's a custom text like "Office", no guest data
      }
    };
    const timer = setTimeout(fetchGuest, 400);
    return () => clearTimeout(timer);
  }, [villaNumber, otherModalType, selectedDate]);

  const fetchCatalog = async () => {
    const { data } = await supabase.from('hsk_master_catalog').select('*').order('article_name');
    if (data) {
        setMasterCatalog(data);
    }
  };

  const fetchSettings = async () => {
    const { data } = await supabase.from('hsk_constants').select('type, label').in('type', ['requester', 'gem']).order('label');
    if (data) {
        setRequesters(data.filter(c => c.type === 'requester').map(c => c.label));
        setGems(data.filter(c => c.type === 'gem').map(c => c.label));
    }
  };

  const fetchRecords = async () => {
    const dateStr = getTodayStr(selectedDate);
    // Grab everything recorded on this local date day
    const { data } = await supabase.from('hsk_daily_requests').select('*').gte('request_time', `${dateStr}T00:00:00+05:00`).lte('request_time', `${dateStr}T23:59:59+05:00`).order('request_time', { ascending: false });
    if (data) setRecords(data);
  };

  const handleOpenModal = (type: 'Minibar' | 'General' | 'GEM') => {
    const now = new Date();
    const tz = typeof window !== 'undefined' ? localStorage.getItem('hk_pulse_timezone') || 'Indian/Maldives' : 'Indian/Maldives';
    const localNow = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
    setManualTime(localNow);
    setVillaNumber(''); setGuestInfo(null); setMbCart([]); setOtherCart([]); setCustomNote(''); setRequesterSearch(''); setMbItemSearch('');
    setOtherCategory('General');
    setIsEditing(false); setEditingId(null);
    
    if (type === 'Minibar') {
        setIsMinibarOpen(true);
    } else {
        setOtherModalType(type);
        setOtherMode(type === 'GEM' ? 'Note' : 'Catalog');
        setIsOtherOpen(true);
    }
  };

  const handleEditRecord = (record: RequestRecord) => {
    setVillaNumber(record.villa_number);
    const tz = typeof window !== 'undefined' ? localStorage.getItem('hk_pulse_timezone') || 'Indian/Maldives' : 'Indian/Maldives';
    setManualTime(new Date(record.request_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }));
    setRequesterSearch(record.attendant_name);
    setIsEditing(true);
    setEditingId(record.id);
    
    if (record.request_type === 'Minibar') {
      const items = record.item_details.split('\n').map(line => {
        const match = line.match(/(\d+)x (.+)/);
        const isRef = line.includes('(Refill)');
        let n = match ? match[2] : line;
        if(isRef) n = n.replace(' (Refill)', '');
        return { name: n.trim(), qty: match ? parseInt(match[1]) : 1, isRefill: isRef };
      });
      setMbCart(items);
      setIsMinibarOpen(true);
    } else {
      setCustomNote(record.item_details);
      setOtherMode('Note');
      setOtherModalType(record.request_type === 'GEM Request' ? 'GEM' : 'General');
      setOtherCategory(record.request_type); // Load existing category
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

  // --- MAGIC WAND API INTEGRATION ---
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
        
        // Populate Extracted Data
        if (data.villa && !villaNumber) setVillaNumber(data.villa);
        if (data.category && otherModalType !== 'GEM') setOtherCategory(data.category);
        setCustomNote(data.summary);
        
        showNotification('success', 'Magic formatting applied!');
    } catch (err) {
        // Local Fallback if API Key is missing or fails
        console.warn("Magic API Failed, using local heuristic fallback.");
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
        showNotification('success', 'Basic formatting applied');
    }
    setIsMagicLoading(false);
  };

  const submitRequest = async (type: 'Minibar' | 'Other') => {
    if (!villaNumber) { showNotification('error', "Villa Required"); return; }
    
    let details = '';
    let reqType = 'General';

    if (type === 'Minibar') {
        details = mbCart.map(i => `${i.qty}x ${i.name}${i.isRefill ? ' (Refill)' : ''}`).join('\n');
        reqType = 'Minibar';
    } else {
        details = otherMode === 'Catalog' ? otherCart.map(i => `${i.qty}x ${i.name}`).join('\n') : customNote;
        if (otherModalType === 'GEM') {
            reqType = 'GEM Request';
        } else {
            reqType = otherCategory; 
        }
    }

    // PERFECT TIMEZONE FIX - Forcing Maldives Time (+05:00) so the DB never shifts the hours!
    const dateStr = getTodayStr(selectedDate);
    const dbTimeStr = `${dateStr}T${manualTime}:00+05:00`;

    const payload = {
       villa_number: villaNumber,
       request_type: reqType,
       item_details: details,
       request_time: dbTimeStr, 
       attendant_name: requesterSearch || (guestInfo ? guestInfo.gem_name : "Guest"),
       guest_name: guestInfo ? guestInfo.mainName : '',
       package_tag: guestInfo?.pkg?.type || '',
    };

    const { error } = isEditing ? await supabase.from('hsk_daily_requests').update(payload).eq('id', editingId) : await supabase.from('hsk_daily_requests').insert(payload);
    if (!error) { setIsMinibarOpen(false); setIsOtherOpen(false); fetchRecords(); showNotification('success', isEditing ? "Updated" : "Saved"); }
  };

  // POST (CHK) MODAL LOGIC
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
      if (!postModal.chk) return alert("Enter CHK number");
      await supabase.from('hsk_daily_requests').update({ is_posted: true, chk_number: postModal.chk }).eq('id', postModal.id);
      setRecords(records.map(r => r.id === postModal.id ? { ...r, is_posted: true, chk_number: postModal.chk } : r));
      setPostModal({ isOpen: false, id: '', chk: '' });
      showNotification('success', 'Bill successfully linked');
  };

  const askDelete = (id: string) => { 
      setConfirmModal({ isOpen: true, id, title: 'Delete Log?', message: 'Are you sure you want to remove this log?' }); 
  };
  
  const deleteRecord = async () => {
    if(!confirmModal.id) return;
    await supabase.from('hsk_daily_requests').delete().eq('id', confirmModal.id);
    setRecords(records.filter(r => r.id !== confirmModal.id));
    setConfirmModal({ isOpen: false, id: null, title: '', message: '' });
    showNotification('success', "Log Deleted");
  };

  const toggleStatus = async (id: string, field: 'is_sent' | 'is_done') => {
    const record = records.find(r => r.id === id);
    if (!record) return;
    const newValue = !record[field];
    setRecords(records.map(r => r.id === id ? { ...r, [field]: newValue } : r));
    await supabase.from('hsk_daily_requests').update({ [field]: newValue }).eq('id', id);
  };

  const openPartialModal = (record: RequestRecord) => {
      setPartialTarget(record);
      const items = record.item_details.split(/\n|,/).map(s => s.trim()).filter(Boolean);
      setPartialSelection(items);
      setIsPartialOpen(true);
  };

  const submitPartial = async () => {
      if (!partialTarget) return;
      const allItems = partialTarget.item_details.split(/\n|,/).map(s => s.trim()).filter(Boolean);
      const sentItems = partialSelection;
      const pendingItems = allItems.filter(i => !sentItems.includes(i));
      await supabase.from('hsk_daily_requests').update({ item_details: sentItems.join('\n'), is_sent: true }).eq('id', partialTarget.id);
      if (pendingItems.length > 0) {
          await supabase.from('hsk_daily_requests').insert({ ...partialTarget, id: undefined, item_details: pendingItems.join('\n'), is_sent: false });
      }
      setIsPartialOpen(false); fetchRecords();
  };

  const isOnlyRefills = (details: string) => {
      const items = details.split(/\n|,/).map(s => s.trim()).filter(Boolean);
      if(items.length === 0) return false;
      return items.every(item => item.includes('(Refill)'));
  };

  const visibleRecords = records.filter(r => {
      const vNum = parseInt(r.villa_number);
      const isMB = r.request_type === 'Minibar';
      const isGemReq = r.request_type === 'GEM Request';
      const onlyRefills = isOnlyRefills(r.item_details);

      // TYPE FILTERS
      if (typeFilter === 'Minibar' && !isMB) return false;
      if (typeFilter === 'GEM' && !isGemReq) return false;
      if (typeFilter === 'General' && (isMB || isGemReq)) return false;

      // STATUS FILTERS
      if (statusFilter === 'Unsent') {
          if (!isMB) return false; 
          if (r.is_sent) return false;
      }
      if (statusFilter === 'Unposted') {
          if (!isMB) return false; 
          if (r.is_posted || onlyRefills) return false;
      }
      if (statusFilter === 'Pending') {
          if (isMB) return false; // Not used for MB
          if (r.is_done) return false;
      }
      if (statusFilter === 'Done') {
          if (isMB && (!r.is_sent || !r.is_posted) && !onlyRefills) return false;
          if (isMB && onlyRefills && !r.is_sent) return false;
          if (!isMB && !r.is_done) return false;
      }
      
      // SEARCH & ZONE FILTERS
      if (villaSearch && !r.villa_number.toLowerCase().includes(villaSearch.toLowerCase())) return false;
      if (jettyFilter === 'Jetty A' && !(vNum >= 1 && vNum <= 35)) return false;
      if (jettyFilter === 'Jetty B' && !(vNum >= 37 && vNum <= 50)) return false;
      if (jettyFilter === 'Jetty C' && !(vNum >= 59 && vNum <= 79)) return false;
      if (jettyFilter === 'Beach' && ((vNum >= 1 && vNum <= 35) || (vNum >= 37 && vNum <= 50) || (vNum >= 59 && vNum <= 79))) return false;
      return true;
  });

  const showNotification = (type: 'success' | 'error', text: string) => { setToastMsg({ type, text }); setTimeout(() => setToastMsg(null), 3000); };

  const minibarItems = masterCatalog.filter(i => i.is_minibar_item);
  const minibarCats = ['All', ...Array.from(new Set(minibarItems.map(i => i.category))) as string[]];
  const amenityItems = masterCatalog.filter(i => !i.is_minibar_item);

  const GuestCard = () => {
      if (!guestInfo) return null;
      return (
        <div className={`mt-3 p-3 rounded-xl border-l-4 shadow-sm animate-in zoom-in-95 ${guestInfo.isCheckout ? 'bg-rose-50 border-rose-500' : 'bg-blue-50 border-blue-500'}`}>
            <div className="flex justify-between items-start">
                <div><h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><User size={14} className="text-slate-400"/>{guestInfo.mainName}</h3></div>
                {guestInfo.pkg && <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${guestInfo.pkg.color}`}>{guestInfo.pkg.type}</span>}
            </div>
            {guestInfo.isCheckout && <div className="mt-1 flex items-center gap-1 text-rose-600 font-bold text-[10px]"><AlertTriangle size={12}/> CHECKOUT TODAY</div>}
        </div>
      );
  };

  return (
    <div className="min-h-screen bg-[#FDFBFD] font-antiqua text-[#6D2158] pb-32">
      
      {/* STANDARDIZED HEADER */}
      <div className="bg-white shadow-sm sticky top-0 z-30 pb-4 px-4 md:px-6 pt-6 border-b border-slate-200 mb-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-4">
           <div className="w-full md:w-auto">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-800">Coordinator's Log Book</h1>
              <div className="relative flex items-center gap-1 text-xs font-bold text-slate-400 uppercase tracking-widest mt-1 cursor-pointer hover:text-[#6D2158] transition-colors">
                  <Calendar size={14}/> {selectedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  <input 
                      type="date" 
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0" 
                      value={selectedDate.toISOString().split('T')[0]} 
                      onChange={(e) => {
                          if (e.target.value) setSelectedDate(new Date(e.target.value));
                      }}
                  />
              </div>
           </div>
           
           <div className="flex gap-2 w-full md:w-auto overflow-x-auto no-scrollbar pb-1">
                <button onClick={() => handleOpenModal('Minibar')} className="flex-1 md:flex-none justify-center bg-rose-600 text-white px-4 py-2.5 rounded-xl font-bold uppercase text-xs shadow-md hover:bg-rose-700 transition-all whitespace-nowrap">Minibar</button>
                <button onClick={() => handleOpenModal('General')} className="flex-1 md:flex-none justify-center bg-[#6D2158] text-white px-4 py-2.5 rounded-xl font-bold uppercase text-xs shadow-md hover:bg-[#5a1b49] transition-all whitespace-nowrap">Gen Req</button>
                <button onClick={() => handleOpenModal('GEM')} className="flex-1 md:flex-none justify-center bg-amber-500 text-white px-4 py-2.5 rounded-xl font-bold uppercase text-xs shadow-md hover:bg-amber-600 transition-all whitespace-nowrap">GEM Req</button>
                <button onClick={() => setIsHistoryOpen(true)} className="flex-none justify-center p-2.5 bg-slate-100 rounded-xl text-slate-500 hover:text-[#6D2158] transition-colors"><List size={18}/></button>
           </div>
        </div>

        <div className="relative mb-4">
            <Search size={14} className="absolute left-3 top-3 text-slate-400" />
            <input type="text" placeholder="Search Villa or Name..." className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-[#6D2158]" value={villaSearch} onChange={e => setVillaSearch(e.target.value)}/>
        </div>

        {/* --- DYNAMIC FILTER GROUPS --- */}
        <div className="flex flex-col gap-3 mb-2">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                <span className="text-[10px] font-bold text-slate-400 uppercase w-12 shrink-0">Type</span>
                {['All', 'Minibar', 'General', 'GEM'].map(t => (
                    <button key={t} onClick={() => setTypeFilter(t)} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase border transition-all whitespace-nowrap ${typeFilter === t ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-400 hover:border-blue-600'}`}>
                        {t}
                    </button>
                ))}
            </div>

            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                <span className="text-[10px] font-bold text-slate-400 uppercase w-12 shrink-0">Status</span>
                {getAvailableStatuses().map(f => (
                    <button key={f} onClick={() => setStatusFilter(f)} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase border transition-all whitespace-nowrap ${statusFilter === f ? 'bg-[#6D2158] border-[#6D2158] text-white shadow-sm' : 'bg-white border-slate-200 text-slate-400 hover:border-[#6D2158]'}`}>
                        {f}
                    </button>
                ))}
            </div>

            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                <span className="text-[10px] font-bold text-slate-400 uppercase w-12 shrink-0">Zone</span>
                {['All', 'Jetty A', 'Jetty B', 'Jetty C', 'Beach'].map(j => (
                    <button key={j} onClick={() => setJettyFilter(j)} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase border transition-all whitespace-nowrap ${jettyFilter === j ? 'bg-slate-800 border-slate-800 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-800'}`}>
                        {j}
                    </button>
                ))}
            </div>
        </div>
      </div>

      <div className="p-4 columns-1 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-6 gap-4 space-y-4">
         {visibleRecords.map(r => {
             const allRefill = isOnlyRefills(r.item_details);
             const isGemReq = r.request_type === 'GEM Request';
             return (
             <div key={r.id} className={`break-inside-avoid rounded-2xl border p-4 flex flex-col bg-white shadow-sm relative transition-all hover:shadow-md ${r.request_type === 'Minibar' ? 'border-rose-100' : isGemReq ? 'border-amber-200' : 'border-slate-200'}`}>
                <div className="flex justify-between items-start mb-3">
                   <div className="flex items-center gap-2">
                     <span className="text-xl font-black text-slate-800 tracking-tight leading-none break-all">{r.villa_number}</span>
                     <button onClick={() => handleEditRecord(r)} className="p-1 text-blue-500 hover:bg-blue-50 rounded transition-colors shrink-0" title="Edit"><Edit3 size={14}/></button>
                   </div>
                   <div className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider shrink-0 ${r.request_type === 'Minibar' ? 'bg-rose-50 text-rose-600' : isGemReq ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{r.request_type}</div>
                </div>
                <div className="mb-4 text-[12px] font-bold text-slate-600 leading-tight space-y-1">
                    {r.item_details.split(/\n|,/).map((item, idx) => (<div key={idx} className={item.includes('(Refill)') ? 'text-blue-600 italic font-black' : ''}>• {item.trim()}</div>))}
                </div>
                <div className="mt-auto pt-3 border-t border-slate-50 flex justify-between items-end">
                   <div className="mr-6">
                      <div className="text-[9px] text-slate-400 font-black uppercase truncate max-w-[60px]">{r.attendant_name}</div>
                      <div className="text-[9px] text-slate-300 font-bold"><Clock size={8} className="inline mr-1"/>{formatLocalTime(r.request_time)}</div>
                      {r.chk_number && <div className="text-[10px] text-[#6D2158] font-black mt-1">CHK: {r.chk_number}</div>}
                   </div>
                   <div className="flex gap-1.5 flex-wrap justify-end">
                     {r.request_type === 'Minibar' ? (
                         <>
                             <button onClick={() => openPartialModal(r)} className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-slate-600" title="Split"><Split size={14}/></button>
                             <button onClick={() => toggleStatus(r.id, 'is_sent')} className={`p-2 rounded-xl transition-all ${r.is_sent ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'bg-slate-100 text-slate-300'}`} title="Sent"><Send size={14}/></button>
                             
                             {!allRefill && (
                                 <button onClick={() => handleOpenPost(r)} className={`p-2 rounded-xl transition-all ${r.is_posted ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'bg-slate-100 text-slate-300'}`} title={r.is_posted ? "Edit Bill" : "Post to Guest"}>
                                     <Check size={14}/>
                                 </button>
                             )}
                         </>
                     ) : isGemReq ? (
                         <>
                             <button onClick={() => toggleStatus(r.id, 'is_sent')} className={`flex items-center gap-1 px-3 py-1.5 rounded-xl transition-all text-[10px] font-bold uppercase tracking-wider ${r.is_sent ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'bg-slate-100 text-slate-400 hover:text-blue-500'}`} title="Informed">
                                 <Send size={12}/> {r.is_sent ? 'Informed' : 'Inform'}
                             </button>
                             <button onClick={() => toggleStatus(r.id, 'is_done')} className={`flex items-center gap-1 px-3 py-1.5 rounded-xl transition-all text-[10px] font-bold uppercase tracking-wider ${r.is_done ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'bg-slate-100 text-slate-400 hover:text-emerald-500'}`} title="Done">
                                 <Check size={12}/> Done
                             </button>
                         </>
                     ) : (
                         <button onClick={() => toggleStatus(r.id, 'is_done')} className={`p-2 rounded-xl transition-all ${r.is_done ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'bg-slate-100 text-slate-300 hover:text-emerald-500'}`} title="Done"><Check size={14}/></button>
                     )}
                     <button onClick={() => askDelete(r.id)} className="p-2 rounded-xl text-slate-200 hover:bg-rose-50 hover:text-rose-500 transition-all active:scale-90"><Trash2 size={14}/></button>
                   </div>
                </div>
             </div>
             )
         })}
      </div>

      {/* CHK NUMBER MODAL */}
      {postModal.isOpen && (
          <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
              <div className="bg-white rounded-[2.5rem] w-full max-w-sm p-8 shadow-2xl animate-in zoom-in-95 duration-200">
                  <h3 className="text-xl font-black text-[#6D2158] text-center mb-2 uppercase tracking-tight">Post Bill</h3>
                  <p className="text-xs font-bold text-slate-400 text-center mb-6 uppercase">Confirm CHK Number</p>
                  
                  <input 
                      type="number" 
                      className="w-full text-center text-3xl font-black p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-[#6D2158] mb-6"
                      value={postModal.chk}
                      onChange={e => setPostModal({...postModal, chk: e.target.value})}
                      autoFocus
                  />

                  <div className="flex flex-col gap-3">
                      <button onClick={confirmPost} className="w-full py-4 bg-[#6D2158] text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-purple-200 active:scale-95 transition-all">Link Bill & Post</button>
                      <button onClick={() => setPostModal({isOpen: false, id: '', chk: ''})} className="w-full py-4 bg-slate-50 text-slate-400 rounded-2xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all hover:bg-slate-100">Cancel</button>
                  </div>
              </div>
          </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {confirmModal.isOpen && (
          <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
              <div className="bg-white rounded-[2.5rem] w-full max-w-sm p-8 shadow-2xl animate-in zoom-in-95 duration-200">
                  <div className="w-16 h-16 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-6 mx-auto"><Trash size={32}/></div>
                  <h3 className="text-xl font-black text-slate-800 text-center mb-2 uppercase tracking-tight">{confirmModal.title}</h3>
                  <p className="text-sm font-bold text-slate-400 text-center mb-8 px-4 leading-relaxed">{confirmModal.message}</p>
                  <div className="flex flex-col gap-3">
                      <button onClick={deleteRecord} className="w-full py-4 bg-rose-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-rose-200 active:scale-95 transition-all hover:bg-rose-700">Confirm Delete</button>
                      <button onClick={() => setConfirmModal({isOpen: false, id: null, title: '', message: ''})} className="w-full py-4 bg-slate-50 text-slate-400 rounded-2xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all hover:bg-slate-100">Go Back</button>
                  </div>
              </div>
          </div>
      )}

      {/* MINIBAR ENTRY MODAL */}
      {isMinibarOpen && (
         <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
            <div className="bg-[#FDFBFD] w-full sm:w-[560px] h-[85vh] sm:rounded-3xl rounded-t-3xl flex flex-col shadow-2xl animate-in slide-in-from-bottom-10">
               <div className="p-4 bg-white border-b border-slate-100 flex justify-between items-center sm:rounded-t-3xl rounded-t-3xl">
                  <h3 className="text-lg font-bold text-rose-700 uppercase tracking-tight">{isEditing ? 'Edit Entry' : 'Minibar Entry'}</h3>
                  <button onClick={() => setIsMinibarOpen(false)} className="bg-slate-100 p-2 rounded-full text-slate-500 hover:bg-slate-200 transition-colors"><X size={18}/></button>
               </div>
               <div className="flex-1 overflow-y-auto p-4">
                  <div className="flex gap-3 mb-4">
                     <input type="text" placeholder="Villa/Name" autoFocus className="w-32 p-3 bg-white border border-slate-200 rounded-xl text-center font-bold text-lg outline-none focus:border-rose-300 shadow-sm" value={villaNumber} onChange={e => setVillaNumber(e.target.value)}/>
                     <div className="flex-1 relative"><input type="text" placeholder="By..." className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-rose-300 shadow-sm" value={requesterSearch} onChange={e => setRequesterSearch(e.target.value)}/></div>
                  </div>
                  <GuestCard />
                  {mbCart.length > 0 && (
                     <div className="mt-4 p-3 bg-white rounded-2xl border-2 border-rose-50 flex flex-wrap gap-2 animate-in zoom-in-95 shadow-sm">
                        {mbCart.map(i => (
                           <div key={i.name} className="flex items-center gap-0.5">
                             <button onClick={() => toggleRefill(i.name)} className={`px-2 py-1.5 rounded-l-xl text-[8px] font-black uppercase transition-all ${i.isRefill ? 'bg-blue-600 text-white shadow-md shadow-blue-100' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>Refill</button>
                             <button onClick={() => setMbCart(mbCart.filter(c => c.name !== i.name))} className={`px-3 py-1.5 rounded-r-xl text-xs font-black flex items-center gap-1 active:scale-95 transition-all ${i.isRefill ? 'bg-blue-50 text-blue-700 border-2 border-blue-100' : 'bg-rose-600 text-white shadow-md hover:bg-rose-700'}`}>{i.qty} {i.name} <X size={12}/></button>
                           </div>
                        ))}
                     </div>
                  )}
                  <div className="relative mt-4 mb-2"><Search size={14} className="absolute left-3 top-3.5 text-slate-400"/><input type="text" placeholder="Find Item..." className="w-full pl-9 pr-4 py-3 bg-white border border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-rose-300 shadow-sm" value={mbItemSearch} onChange={(e) => setMbItemSearch(e.target.value)}/></div>
                  <div className="flex flex-wrap gap-2 mb-4 mt-4 overflow-x-auto no-scrollbar pb-2">{minibarCats.map(c => (<button key={c} onClick={() => setMbCategory(c)} className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase border whitespace-nowrap transition-all shadow-sm ${mbCategory === c ? 'bg-rose-600 text-white border-rose-600' : 'bg-white border-slate-200 text-slate-500 hover:border-rose-300'}`}>{c}</button>))}</div>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pb-24">
                     {minibarItems.filter(i => (mbCategory === 'All' || i.category === mbCategory) && (i.article_name.toLowerCase().includes(mbItemSearch.toLowerCase()) || (i.generic_name || "").toLowerCase().includes(mbItemSearch.toLowerCase()))).map(item => {
                        const inCart = mbCart.find(c => c.name === (item.generic_name || item.article_name));
                        return (
                        <button key={item.article_number} onClick={() => addToCart(item.generic_name || item.article_name, 'MB')} className={`bg-white p-3 rounded-2xl border-2 flex flex-col items-center gap-3 active:scale-95 transition-transform overflow-hidden group relative ${inCart ? 'border-rose-500 ring-4 ring-rose-100 shadow-md' : 'border-slate-100 hover:border-rose-200'}`}>
                           {inCart && <div className="absolute top-2 right-2 bg-rose-500 text-white text-xs font-black px-2 py-0.5 rounded-full animate-in zoom-in">{inCart.qty}</div>}
                           <div className="w-full aspect-square bg-slate-50 rounded-xl flex items-center justify-center overflow-hidden h-20 sm:h-24">
                               {item.image_url ? <img src={item.image_url} alt="" className="w-full h-full object-contain p-2 group-hover:scale-110 transition-transform duration-500"/> : <Wine size={20} className="text-rose-200"/>}
                           </div>
                           <span className="text-xs font-bold text-slate-700 text-center leading-tight line-clamp-2 h-8 flex items-center">{item.generic_name || item.article_name}</span>
                        </button>
                     )})}
                  </div>
               </div>
               <div className="p-4 bg-white border-t border-slate-100 shadow-[0_-10px_20px_rgba(0,0,0,0.02)] sm:rounded-b-3xl">
                  <button onClick={() => submitRequest('Minibar')} className="w-full bg-rose-600 text-white py-4 rounded-xl font-bold uppercase tracking-widest shadow-xl shadow-rose-600/20 active:scale-95 transition-all hover:bg-rose-700">{isEditing ? 'Confirm Update' : 'Save To Log'}</button>
               </div>
            </div>
         </div>
      )}

      {/* OTHER / GEM MODAL */}
      {isOtherOpen && (
         <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
            <div className={`bg-[#FDFBFD] w-full sm:w-[500px] h-[85vh] sm:rounded-3xl rounded-t-3xl flex flex-col shadow-2xl animate-in slide-in-from-bottom-10 ${otherModalType === 'GEM' ? 'border-2 border-amber-400' : ''}`}>
               <div className="p-4 bg-white border-b border-slate-100 flex justify-between items-center sm:rounded-t-3xl rounded-t-3xl">
                  <h3 className={`text-lg font-bold flex items-center gap-2 uppercase tracking-tight ${otherModalType === 'GEM' ? 'text-amber-600' : 'text-[#6D2158]'}`}>
                      <Wrench size={20}/> {otherModalType === 'GEM' ? 'GEM Request' : 'General Request'}
                  </h3>
                  <button onClick={() => setIsOtherOpen(false)} className="bg-slate-100 p-2 rounded-full text-slate-500 hover:bg-slate-200"><X size={18}/></button>
               </div>
               <div className="flex-1 overflow-y-auto p-4 flex flex-col">
                  
                  {/* General inputs: Villa & Name */}
                  <div className="flex gap-2 mb-4">
                     <input type="text" placeholder="Villa/Name" autoFocus className="w-32 p-3 bg-white border border-slate-200 rounded-xl text-center font-bold text-lg outline-none focus:border-[#6D2158]" value={villaNumber} onChange={e => setVillaNumber(e.target.value)}/>
                     
                     {/* If it's a GEM request, show dropdown from Settings. Otherwise show text input */}
                     {otherModalType === 'GEM' ? (
                         <select className="flex-1 p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm text-slate-700 outline-none focus:border-amber-500" value={requesterSearch} onChange={e => setRequesterSearch(e.target.value)}>
                             <option value="" disabled>Select GEM...</option>
                             {gems.map(g => <option key={g} value={g}>{g}</option>)}
                         </select>
                     ) : (
                         <input type="text" placeholder="Requested By..." className="flex-1 px-4 bg-white border border-slate-200 rounded-xl font-bold text-sm text-slate-700 outline-none focus:border-[#6D2158]" value={requesterSearch} onChange={e => setRequesterSearch(e.target.value)}/>
                     )}
                  </div>
                  
                  <GuestCard />
                  
                  <div className="flex bg-slate-200 p-1 rounded-xl mb-4 mt-4 shrink-0">
                     <button onClick={() => setOtherMode('Catalog')} className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-all ${otherMode === 'Catalog' ? 'bg-white shadow text-[#6D2158]' : 'text-slate-500 hover:text-slate-600'}`}>Items</button>
                     <button onClick={() => setOtherMode('Note')} className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-all ${otherMode === 'Note' ? 'bg-white shadow text-[#6D2158]' : 'text-slate-500 hover:text-slate-600'}`}>Message / Note</button>
                  </div>
                  
                  {otherMode === 'Catalog' ? (
                     <div className="grid grid-cols-3 gap-3 pb-20">
                        {amenityItems.map(item => {
                           const inCart = otherCart.find(c => c.name === (item.generic_name || item.article_name));
                           return (
                               <button key={item.article_number} onClick={() => addToCart(item.generic_name || item.article_name, 'Other')} className={`bg-white p-2 rounded-xl flex flex-col items-center gap-2 active:scale-95 transition-all overflow-hidden group relative border-2 ${inCart ? 'border-[#6D2158] shadow-md ring-4 ring-[#6D2158]/10' : 'border-slate-100 hover:border-slate-200'}`}>
                                  {inCart && <div className="absolute top-1 right-1 bg-[#6D2158] text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-in zoom-in">{inCart.qty}</div>}
                                  <div className="w-full aspect-square bg-slate-50 rounded-lg flex items-center justify-center overflow-hidden h-14"><img src={item.image_url || '/placeholder.png'} alt="" className="w-full h-full object-contain p-1 group-hover:scale-110 transition-all"/></div>
                                  <span className="text-[9px] font-bold text-slate-600 text-center leading-tight line-clamp-2 h-6">{item.generic_name || item.article_name}</span>
                               </button>
                           )
                        })}
                     </div>
                  ) : (
                     <div className="flex flex-col gap-3 h-full pb-6">
                         {otherModalType !== 'GEM' && (
                             <select value={otherCategory} onChange={e => setOtherCategory(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm text-slate-700 outline-none focus:border-[#6D2158]">
                                <option value="General">General Request</option>
                                <option value="Cleaning">Cleaning</option>
                                <option value="Maintenance">Maintenance</option>
                                <option value="Amenities">Amenities</option>
                                <option value="Laundry">Laundry</option>
                             </select>
                         )}
                         <div className="relative flex-1 min-h-[200px]">
                             <textarea 
                                 className="w-full h-full p-4 pr-12 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-[#6D2158] shadow-inner resize-none leading-relaxed" 
                                 placeholder="Paste your long request message here..." 
                                 value={customNote} 
                                 onChange={e => setCustomNote(e.target.value)}
                             />
                             <button 
                                 onClick={handleMagicFormat} 
                                 disabled={isMagicLoading || !customNote}
                                 title="Magic Format (AI)" 
                                 className="absolute top-3 right-3 p-2.5 bg-[#6D2158]/10 text-[#6D2158] rounded-lg hover:bg-[#6D2158] hover:text-white transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:hover:bg-[#6D2158]/10 disabled:hover:text-[#6D2158] flex items-center justify-center group"
                             >
                                 {isMagicLoading ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} className="group-hover:animate-pulse" />}
                             </button>
                         </div>
                     </div>
                  )}
               </div>
               <div className="p-4 bg-white border-t border-slate-100 shadow-[0_-10px_20px_rgba(0,0,0,0.02)] sm:rounded-b-3xl shrink-0">
                  <button onClick={() => submitRequest('Other')} className={`w-full text-white py-4 rounded-xl font-bold uppercase tracking-widest shadow-xl active:scale-95 transition-all ${otherModalType === 'GEM' ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-600/20' : 'bg-[#6D2158] hover:bg-[#5a1b49] shadow-purple-900/20'}`}>Save Request</button>
               </div>
            </div>
         </div>
      )}

      {/* PARTIAL SEND MODAL */}
      {isPartialOpen && partialTarget && (
          <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 border-2 border-[#6D2158]/10">
                  <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2 uppercase tracking-tight"><Split size={20}/> Partial Send</h3>
                  <p className="text-[10px] font-bold text-slate-400 mb-4 uppercase">Select items to mark as <b>SENT</b>.</p>
                  <div className="space-y-2 mb-6">
                      {partialTarget.item_details.split(/\n|,/).map((item, i) => {
                          const itemStr = item.trim();
                          if(!itemStr) return null;
                          const isSelected = partialSelection.includes(itemStr);
                          return (
                              <button key={i} onClick={() => isSelected ? setPartialSelection(partialSelection.filter(x => x !== itemStr)) : setPartialSelection([...partialSelection, itemStr])}
                                className={`w-full p-3 rounded-xl flex items-center justify-between border-2 font-bold text-sm transition-all ${isSelected ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-slate-50 border-transparent text-slate-400 hover:border-slate-200'}`}>{itemStr} {isSelected ? <CheckCircle2 size={18} className="text-blue-600"/> : <div className="w-4 h-4 rounded-full border-2 border-slate-200"/>}</button>
                          )})}
                  </div>
                  <button onClick={submitPartial} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold uppercase tracking-wider text-xs shadow-lg mb-2 active:scale-95 transition-all">Confirm Dispatch</button>
                  <button onClick={() => setIsPartialOpen(false)} className="w-full py-3 text-slate-400 hover:bg-slate-50 rounded-xl font-bold text-[10px] uppercase transition-colors">Cancel</button>
              </div>
          </div>
      )}

      {toastMsg && (
          <div className={`fixed top-4 right-4 px-6 py-4 rounded-xl shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-5 z-[100] border-2 ${toastMsg.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
              {toastMsg.type === 'success' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
              <span className="text-sm font-bold uppercase">{toastMsg.text}</span>
          </div>
      )}
    </div>
  );
}
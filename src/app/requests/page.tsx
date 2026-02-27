"use client";
import React, { useState, useEffect } from 'react';
import { 
  Search, Plus, X, Wine, Wrench, Trash2, 
  Calendar, Split, Send, Check, Clock, Edit3, Wand2, Loader2, 
  CheckCircle2, AlertTriangle, User, Bell, BellRing, MessageCircle
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/components/ConfirmProvider';
import PageHeader from '@/components/PageHeader';
import toast from 'react-hot-toast';

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
  image_url?: string; 
};

// --- WEB PUSH HELPERS ---
function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

const registerAndSubscribePush = async () => {
    try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;

        const registration = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return false;

        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidPublicKey) return false;

        const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);
        
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: convertedVapidKey
            });
        }

        const subData = JSON.parse(JSON.stringify(subscription));
        await supabase.from('hsk_push_subscriptions').upsert({
            endpoint: subData.endpoint,
            auth: subData.keys.auth,
            p256dh: subData.keys.p256dh
        }, { onConflict: 'endpoint' });

        return true;
    } catch (err) {
        console.error("Push registration failed", err);
        return false;
    }
};

// --- HELPERS ---
const getTodayStr = (dateObj: Date = new Date()) => {
  const tz = typeof window !== 'undefined' ? localStorage.getItem('hk_pulse_timezone') || 'Asia/Dhaka' : 'Asia/Dhaka';
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(dateObj);
};

const formatLocalTime = (dateStr: string) => {
    const tz = typeof window !== 'undefined' ? localStorage.getItem('hk_pulse_timezone') || 'Asia/Dhaka' : 'Asia/Dhaka';
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
  const { confirmAction } = useConfirm(); // GLOBAL CONFIRM HOOK

  const [records, setRecords] = useState<RequestRecord[]>([]);
  const [dailyGuests, setDailyGuests] = useState<Record<string, any>>({}); // MAPS GUEST INFO TO DASHBOARD CARDS
  const [masterCatalog, setMasterCatalog] = useState<MasterItem[]>([]);
  const [gems, setGems] = useState<string[]>([]);
  
  // UI State
  const [isMinibarOpen, setIsMinibarOpen] = useState(false);
  const [isOtherOpen, setIsOtherOpen] = useState(false);
  const [otherModalType, setOtherModalType] = useState<'General' | 'GEM'>('General');
  const [isPartialOpen, setIsPartialOpen] = useState(false);
  const [notifyPerm, setNotifyPerm] = useState<string>('default');

  // EDIT STATE
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // POST / BILL NUMBER MODAL
  const [postModal, setPostModal] = useState({ isOpen: false, id: '', chk: '' });
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  // FILTERS
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [jettyFilter, setJettyFilter] = useState('All');
  const [villaSearch, setVillaSearch] = useState('');
  
  // MODAL DATA
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

  // INIT & REALTIME SYNC
  useEffect(() => { 
    if ('Notification' in window) {
        setNotifyPerm(Notification.permission);
        if (Notification.permission === 'granted') {
            registerAndSubscribePush();
        }
    }

    fetchRecords(); 
    fetchCatalog(); 
    fetchSettings(); 

    const channel = supabase.channel('requests_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_daily_requests' }, () => {
          fetchRecords(); 
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const handleEnableNotifications = async () => {
      const success = await registerAndSubscribePush();
      if (success) {
          setNotifyPerm('granted');
          toast.success('Background Push Notifications Enabled!');
      } else {
          setNotifyPerm('denied');
          toast.error('Notifications blocked or not supported on this device.');
      }
  };

  const triggerTestPush = async () => {
      toast.success('Sending test push...');
      try {
          await fetch('/api/notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: `Test Notification Works!`, body: `Your background system is successfully connected.` })
          });
      } catch (err) { console.error("Test push failed", err); }
  };

  // SMART FILTER UPDATE LOGIC
  const getAvailableStatuses = () => {
      if (typeFilter === 'Minibar') return ['All', 'Unsent', 'Unposted', 'Done'];
      if (typeFilter === 'General' || typeFilter === 'GEM') return ['All', 'Pending', 'Done'];
      return ['All', 'Unsent', 'Unposted', 'Pending', 'Done'];
  };

  useEffect(() => {
      const validStatuses = getAvailableStatuses();
      if (!validStatuses.includes(statusFilter)) setStatusFilter('All');
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter]);

  // AUTO FETCH GUEST FOR MODAL
  useEffect(() => {
    const fetchGuest = async () => {
      if (!villaNumber || villaNumber.length < 1) { setGuestInfo(null); return; }
      
      if (/^\d+$/.test(villaNumber)) {
          const { data } = await supabase.from('hsk_daily_summary').select('*').eq('report_date', getTodayStr(selectedDate)).eq('villa_number', villaNumber).maybeSingle();
          if (data) {
            setGuestInfo({ ...data, mainName: extractMainGuest(data.guest_name), pkg: analyzePackage(data.meal_plan), isCheckout: data.status.includes('DEP') });
            
            // Fix: DO NOT auto-fill GEM name if this is a Minibar request. Let the user type the VA Name.
            if(data.gem_name && !requesterSearch && !isMinibarOpen && otherModalType !== 'GEM') {
                setRequesterSearch(data.gem_name);
            }

          } else { setGuestInfo(null); }
      } else {
          setGuestInfo(null);
      }
    };
    const timer = setTimeout(fetchGuest, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [villaNumber, otherModalType, selectedDate, isMinibarOpen]);

  const fetchCatalog = async () => {
    const { data } = await supabase.from('hsk_master_catalog').select('*').order('article_name');
    if (data) setMasterCatalog(data);
  };

  const fetchSettings = async () => {
    const { data } = await supabase.from('hsk_constants').select('type, label').in('type', ['gem']).order('label');
    if (data) setGems(data.filter(c => c.type === 'gem').map(c => c.label));
  };

  const fetchRecords = async () => {
    const dateStr = getTodayStr(selectedDate);
    
    // Fetch both Requests AND Guest Summary simultaneously
    const [reqRes, guestRes] = await Promise.all([
        supabase.from('hsk_daily_requests').select('*').gte('request_time', `${dateStr}T00:00:00+05:00`).lte('request_time', `${dateStr}T23:59:59+05:00`).order('request_time', { ascending: false }),
        supabase.from('hsk_daily_summary').select('villa_number, meal_plan, stay_dates, status').eq('report_date', dateStr)
    ]);
    
    if (reqRes.data) setRecords(reqRes.data);
    
    if (guestRes.data) {
        const gMap: Record<string, any> = {};
        guestRes.data.forEach(g => {
            gMap[g.villa_number] = g;
        });
        setDailyGuests(gMap);
    }
  };

  const handleOpenModal = (type: 'Minibar' | 'General' | 'GEM') => {
    const tz = typeof window !== 'undefined' ? localStorage.getItem('hk_pulse_timezone') || 'Asia/Dhaka' : 'Asia/Dhaka';
    setManualTime(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()));
    setVillaNumber(''); setGuestInfo(null); setMbCart([]); setOtherCart([]); setCustomNote(''); setRequesterSearch(''); setMbItemSearch('');
    setOtherCategory('General'); setIsEditing(false); setEditingId(null);
    
    if (type === 'Minibar') setIsMinibarOpen(true);
    else { setOtherModalType(type); setOtherMode(type === 'GEM' ? 'Note' : 'Catalog'); setIsOtherOpen(true); }
  };

  const handleEditRecord = (record: RequestRecord) => {
    setVillaNumber(record.villa_number);
    const tz = typeof window !== 'undefined' ? localStorage.getItem('hk_pulse_timezone') || 'Asia/Dhaka' : 'Asia/Dhaka';
    setManualTime(new Date(record.request_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }));
    setRequesterSearch(record.attendant_name);
    setIsEditing(true);
    setEditingId(record.id);
    
    if (record.request_type === 'Minibar') {
      const items = (record.item_details || '').split('\n').map(line => {
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

    const dateStr = getTodayStr(selectedDate);
    const dbTimeStr = `${dateStr}T${manualTime}:00+05:00`; // Preserves +5 offset format for DB processing
    const attendantName = requesterSearch || (guestInfo ? guestInfo.gem_name : "Guest");

    const payload = {
       villa_number: villaNumber,
       request_type: reqType,
       item_details: details,
       request_time: dbTimeStr, 
       attendant_name: attendantName,
       guest_name: guestInfo ? guestInfo.mainName : '',
       package_tag: guestInfo?.pkg?.type || '',
    };

    const { error } = isEditing 
      ? await supabase.from('hsk_daily_requests').update(payload).eq('id', editingId) 
      : await supabase.from('hsk_daily_requests').insert(payload);
      
    if (!error) { 
      setIsMinibarOpen(false); setIsOtherOpen(false); fetchRecords(); 
      toast.success(isEditing ? "Updated" : "Saved"); 

      if (!isEditing) {
          fetch('/api/notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  title: `Villa ${villaNumber} - ${reqType}`,
                  body: `Requested by: ${attendantName}`
              })
          }).catch(console.error);
      }
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

  // --- WHATSAPP HELPER FUNCTION ---
  const handleWhatsApp = (record: RequestRecord, type: 'inform' | 'done') => {
      // Clean up the bullets before sending to whatsapp
      const cleanDetails = (record.item_details || '')
          .split(/\n|,/)
          .map(s => s.trim().replace(/^[•\-\*]\s*/, ''))
          .filter(Boolean)
          .join('\n- ');

      let text = '';
      if (type === 'inform') {
          text = `V${record.villa_number}\n- ${cleanDetails}`;
          if (!record.is_sent) toggleStatus(record.id, 'is_sent'); // Automatically toggle standard inform state
      } else {
          text = `V${record.villa_number}\n- ${cleanDetails}\nDONE ✅`;
          if (!record.is_done) toggleStatus(record.id, 'is_done'); // Automatically toggle standard done state
      }

      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const openPartialModal = (record: RequestRecord) => {
      setPartialTarget(record);
      const items = (record.item_details || '').split(/\n|,/).map(s => s.trim()).filter(Boolean);
      setPartialSelection(items);
      setIsPartialOpen(true);
  };

  const submitPartial = async () => {
      if (!partialTarget) return;
      const allItems = (partialTarget.item_details || '').split(/\n|,/).map(s => s.trim()).filter(Boolean);
      const sentItems = partialSelection;
      const pendingItems = allItems.filter(i => !sentItems.includes(i));
      await supabase.from('hsk_daily_requests').update({ item_details: sentItems.join('\n'), is_sent: true }).eq('id', partialTarget.id);
      if (pendingItems.length > 0) {
          await supabase.from('hsk_daily_requests').insert({ ...partialTarget, id: undefined, item_details: pendingItems.join('\n'), is_sent: false });
      }
      setIsPartialOpen(false); fetchRecords();
  };

  const isOnlyRefills = (details: string) => {
      const items = (details || '').split(/\n|,/).map(s => s.trim()).filter(Boolean);
      if(items.length === 0) return false;
      return items.every(item => item.includes('(Refill)'));
  };

  const visibleRecords = records.filter(r => {
      const vNum = parseInt(r.villa_number);
      const isMB = r.request_type === 'Minibar';
      const isGemReq = r.request_type === 'GEM Request';
      const onlyRefills = isOnlyRefills(r.item_details);

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
  const amenityItems = masterCatalog.filter(i => !i.is_minibar_item);

  // MODAL GUEST CARD
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
        title={
          <>
            Request Log
            {notifyPerm !== 'granted' ? (
                <button onClick={handleEnableNotifications} className="ml-2 text-rose-500 hover:text-rose-600 active:scale-90 transition-transform bg-rose-50 p-1.5 rounded-full shadow-sm" title="Enable Background Notifications">
                    <Bell size={14} className="animate-pulse" />
                </button>
            ) : (
                <button onClick={triggerTestPush} className="ml-2 text-emerald-500 hover:text-emerald-600 active:scale-90 transition-transform bg-emerald-50 p-1.5 rounded-full shadow-sm" title="Test Push Notifications">
                    <BellRing size={14} />
                </button>
            )}
          </>
        }
        date={selectedDate}
        onDateChange={setSelectedDate}
        actions={
          <div className="flex gap-2 overflow-x-auto no-scrollbar w-full md:w-auto">
            <button onClick={() => handleOpenModal('Minibar')} className="btn-danger !px-4 !py-2.5">Minibar</button>
            <button onClick={() => handleOpenModal('General')} className="btn-primary !px-4 !py-2.5">Gen Req</button>
            <button onClick={() => handleOpenModal('GEM')} className="btn-primary !bg-amber-500 !shadow-amber-500/20 hover:!bg-amber-600 !px-4 !py-2.5 text-white">GEM Req</button>
          </div>
        }
      >
        <div className="relative mt-2">
            <Search size={16} className="absolute left-4 top-4 text-slate-400" />
            <input type="text" placeholder="Search Villa or Name..." className="input-field pl-12 py-3 text-[16px] md:text-sm" value={villaSearch} onChange={e => setVillaSearch(e.target.value)}/>
        </div>

        <div className="flex flex-col gap-2.5 mt-2">
            <div className="flex gap-2 overflow-x-auto no-scrollbar items-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase w-10 shrink-0">Type</span>
                {['All', 'Minibar', 'General', 'GEM'].map(t => (
                    <button key={t} onClick={() => setTypeFilter(t)} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase transition-all whitespace-nowrap active:scale-95 ${typeFilter === t ? 'bg-slate-800 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-400'}`}>{t}</button>
                ))}
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar items-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase w-10 shrink-0">State</span>
                {getAvailableStatuses().map(f => (
                    <button key={f} onClick={() => setStatusFilter(f)} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase transition-all whitespace-nowrap active:scale-95 ${statusFilter === f ? 'bg-[#6D2158] text-white shadow-md shadow-[#6D2158]/20' : 'bg-white border border-slate-200 text-slate-500 hover:border-[#6D2158]'}`}>{f}</button>
                ))}
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar items-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase w-10 shrink-0">Zone</span>
                {['All', 'Jetty A', 'Jetty B', 'Jetty C', 'Beach'].map(j => (
                    <button key={j} onClick={() => setJettyFilter(j)} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase transition-all whitespace-nowrap active:scale-95 ${jettyFilter === j ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'bg-white border border-slate-200 text-slate-500 hover:border-blue-600'}`}>{j}</button>
                ))}
            </div>
        </div>
      </PageHeader>

      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-32">
         {visibleRecords.map(r => {
             const allRefill = isOnlyRefills(r.item_details);
             const isGemReq = r.request_type === 'GEM Request';
             const isGeneralReq = r.request_type === 'General Request' || r.request_type === 'Cleaning' || r.request_type === 'Maintenance' || r.request_type === 'Amenities' || r.request_type === 'Laundry';
             
             // --- ATTACH LIVE GUEST INFO TO DASHBOARD CARDS ---
             const gInfo = dailyGuests[r.villa_number] || dailyGuests[r.villa_number.replace('-1', '').replace('-2', '')];
             
             let depDate = '';
             if (gInfo?.stay_dates) {
                 const parts = gInfo.stay_dates.split('-');
                 if (parts.length > 1) depDate = parts[1].trim();
                 else depDate = gInfo.stay_dates;
             }
             
             const mealPlan = gInfo?.meal_plan || r.package_tag || '';
             const isCheckout = gInfo?.status?.includes('DEP');

             return (
             <div key={r.id} className={`card-standard ${r.request_type === 'Minibar' ? 'border-rose-100' : isGemReq ? 'border-amber-200' : 'border-slate-200'} ${isCheckout ? 'bg-rose-50/40' : ''}`}>
                <div className="flex justify-between items-start mb-3">
                   <div className="flex flex-col gap-1.5">
                       <div className="flex items-center gap-2">
                         <span className="text-2xl font-black text-slate-800 tracking-tight leading-none break-all">{r.villa_number}</span>
                         <button onClick={() => handleEditRecord(r)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors shrink-0" title="Edit"><Edit3 size={14}/></button>
                       </div>
                       
                       {/* NATIVE BADGES FOR MEAL PLAN & DEP DATE */}
                       <div className="flex items-center gap-1.5 flex-wrap">
                           {mealPlan && <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md text-[9px] font-black uppercase border border-slate-200">{mealPlan}</span>}
                           {depDate && <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase border ${isCheckout ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>Dep: {depDate}</span>}
                       </div>
                   </div>

                   <div className={`px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-wider shrink-0 shadow-sm ${r.request_type === 'Minibar' ? 'bg-rose-50 text-rose-600 border border-rose-100' : isGemReq ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>{r.request_type}</div>
                </div>
                
                {/* FIX: DOUBLE BULLETS REMOVAL */}
                <div className="mb-4 text-sm font-bold text-slate-600 leading-snug space-y-1">
                    {(r.item_details || '').split(/\n|,/).map((item: string, idx: number) => {
                        const cleanItem = item.trim().replace(/^[•\-\*]\s*/, ''); // Strips out any existing bullet/dash/star
                        if (!cleanItem) return null;
                        return (<div key={idx}>• {cleanItem}</div>);
                    })}
                </div>

                <div className="mt-auto pt-4 border-t border-slate-50 flex justify-between items-end">
                   <div className="mr-6">
                      <div className="text-[10px] text-slate-400 font-black uppercase">{r.attendant_name}</div>
                      <div className="text-[10px] text-slate-400 font-bold mt-0.5"><Clock size={10} className="inline mr-1 -mt-0.5"/>{formatLocalTime(r.request_time)}</div>
                      {r.chk_number && <div className="text-[10px] text-[#6D2158] font-black mt-1">CHK: {r.chk_number}</div>}
                   </div>
                   <div className="flex gap-2 flex-wrap justify-end">
                     {r.request_type === 'Minibar' ? (
                         <>
                             <button onClick={() => openPartialModal(r)} className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-slate-600 active:scale-90 transition-transform" title="Split"><Split size={16}/></button>
                             <button onClick={() => toggleStatus(r.id, 'is_sent')} className={`p-2.5 rounded-xl active:scale-90 transition-all ${r.is_sent ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'bg-slate-100 text-slate-400 hover:bg-blue-50 hover:text-blue-600'}`} title="Sent"><Send size={16}/></button>
                             
                             {!allRefill && (
                                 <button onClick={() => handleOpenPost(r)} className={`p-2.5 rounded-xl active:scale-90 transition-all ${r.is_posted ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20' : 'bg-slate-100 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600'}`} title={r.is_posted ? "Edit Bill" : "Post to Guest"}>
                                     <Check size={16}/>
                                 </button>
                             )}
                         </>
                     ) : (
                         <>
                             {/* WhatsApp Inform */}
                             <button onClick={() => handleWhatsApp(r, 'inform')} className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 active:scale-90 transition-transform" title="WhatsApp Inform">
                                 <MessageCircle size={16} />
                             </button>
                             {/* Standard Inform Toggle */}
                             <button onClick={() => toggleStatus(r.id, 'is_sent')} className={`p-2.5 rounded-xl active:scale-90 transition-all ${r.is_sent ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'bg-slate-100 text-slate-400 hover:text-blue-500'}`} title={r.is_sent ? 'Informed' : 'Inform'}>
                                 <Send size={16}/>
                             </button>

                             {/* WhatsApp Done */}
                             <button onClick={() => handleWhatsApp(r, 'done')} className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 active:scale-90 transition-transform flex items-center gap-0.5" title="WhatsApp Done">
                                 <MessageCircle size={16}/><Check size={10} strokeWidth={4}/>
                             </button>
                             {/* Standard Done Toggle */}
                             <button onClick={() => toggleStatus(r.id, 'is_done')} className={`p-2.5 rounded-xl active:scale-90 transition-all ${r.is_done ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20' : 'bg-slate-100 text-slate-400 hover:text-emerald-500'}`} title="Done">
                                 <Check size={16}/>
                             </button>
                         </>
                     )}
                     <button onClick={() => askDelete(r.id)} className="p-2.5 rounded-xl text-slate-300 hover:bg-rose-50 hover:text-rose-500 active:scale-90 transition-all"><Trash2 size={16}/></button>
                   </div>
                </div>
             </div>
             )
         })}
      </div>

      {postModal.isOpen && (
          <div className="modal-overlay">
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
         <div className="bottom-sheet-overlay">
            <div className="bottom-sheet-content">
               <div className="drag-handle"></div>
               
               <div className="px-6 py-4 flex justify-between items-center border-b border-slate-100 shrink-0">
                  <h3 className="text-xl font-black text-rose-700 tracking-tight flex items-center gap-2">
                      <Wine size={20}/> {isEditing ? 'Edit Entry' : 'Minibar Log'}
                  </h3>
                  <button onClick={() => setIsMinibarOpen(false)} className="bg-slate-100 p-2 rounded-full text-slate-500 active:scale-90 transition-transform"><X size={20}/></button>
               </div>
               
               <div className="flex-1 overflow-y-auto p-6 pb-32 custom-scrollbar">
                  <div className="flex gap-3 mb-4">
                     <input type="text" placeholder="Villa" autoFocus className="input-field w-24 text-center text-xl text-[16px] md:text-sm" value={villaNumber} onChange={e => setVillaNumber(e.target.value)}/>
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
               
               <div className="p-4 bg-white/90 backdrop-blur-xl border-t border-slate-100 pb-safe shadow-[0_-10px_40px_rgba(0,0,0,0.05)] sm:rounded-b-[2.5rem] absolute bottom-0 w-full z-10">
                  <button onClick={() => submitRequest('Minibar')} className="btn-danger w-full py-5 text-sm">
                      {isEditing ? 'Confirm Update' : 'Save To Log'}
                  </button>
               </div>
            </div>
         </div>
      )}

      {isOtherOpen && (
         <div className="bottom-sheet-overlay">
            <div className={`bottom-sheet-content ${otherModalType === 'GEM' ? 'border-t-4 border-amber-400' : ''}`}>
               <div className="drag-handle"></div>

               <div className="px-6 py-4 flex justify-between items-center border-b border-slate-100 shrink-0">
                  <h3 className={`text-xl font-black flex items-center gap-2 uppercase tracking-tight ${otherModalType === 'GEM' ? 'text-amber-600' : 'text-[#6D2158]'}`}>
                      <Wrench size={24}/> {otherModalType === 'GEM' ? 'GEM Request' : 'General Request'}
                  </h3>
                  <button onClick={() => setIsOtherOpen(false)} className="bg-slate-100 p-2 rounded-full text-slate-500 active:scale-90 transition-transform"><X size={20}/></button>
               </div>

               <div className="flex-1 overflow-y-auto p-6 pb-32 custom-scrollbar">
                  <div className="flex gap-3 mb-4">
                     <input type="text" placeholder="Villa" autoFocus className="input-field w-24 text-center text-xl text-[16px] md:text-sm" value={villaNumber} onChange={e => setVillaNumber(e.target.value)}/>
                     {otherModalType === 'GEM' ? (
                         <select className="input-field flex-1 text-[16px] md:text-sm focus:border-amber-500" value={requesterSearch} onChange={e => setRequesterSearch(e.target.value)}>
                             <option value="" disabled>Select GEM...</option>
                             {gems.map(g => <option key={g} value={g}>{g}</option>)}
                         </select>
                     ) : (
                         <input type="text" placeholder="Requested By..." className="input-field flex-1 text-[16px] md:text-sm" value={requesterSearch} onChange={e => setRequesterSearch(e.target.value)}/>
                     )}
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

               <div className="p-4 bg-white/90 backdrop-blur-xl border-t border-slate-100 pb-safe shadow-[0_-10px_40px_rgba(0,0,0,0.05)] sm:rounded-b-[2.5rem] absolute bottom-0 w-full z-10">
                  <button onClick={() => submitRequest('Other')} className={`btn-primary w-full py-5 text-sm ${otherModalType === 'GEM' ? '!bg-amber-500 !shadow-amber-500/20 hover:!bg-amber-600' : ''}`}>
                      {isEditing ? 'Confirm Update' : 'Save Request'}
                  </button>
               </div>
            </div>
         </div>
      )}

      {isPartialOpen && partialTarget && (
          <div className="bottom-sheet-overlay">
              <div className="bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] w-full max-w-sm p-8 shadow-2xl animate-in slide-in-from-bottom-full duration-300">
                  <div className="drag-handle mb-6"></div>
                  
                  <h3 className="text-2xl font-black text-slate-800 mb-2 flex items-center justify-center gap-2 uppercase tracking-tight"><Split size={24}/> Partial Send</h3>
                  <p className="text-xs font-bold text-slate-400 mb-8 uppercase text-center">Select items to mark as <b>SENT</b>.</p>
                  
                  <div className="space-y-3 mb-8">
                      {(partialTarget.item_details || '').split(/\n|,/).map((item, i) => {
                          const itemStr = item.trim();
                          if(!itemStr) return null;
                          const isSelected = partialSelection.includes(itemStr);
                          return (
                              <button key={i} onClick={() => isSelected ? setPartialSelection(partialSelection.filter(x => x !== itemStr)) : setPartialSelection([...partialSelection, itemStr])}
                                className={`w-full p-4 rounded-2xl flex items-center justify-between border-2 font-bold text-sm transition-all active:scale-95 ${isSelected ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-slate-50 border-transparent text-slate-500'}`}>
                                  {itemStr} 
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
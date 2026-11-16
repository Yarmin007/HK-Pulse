"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Plus, Minus, X, Wine, Wrench, Trash2, 
  Split, Send, Check, Clock, Edit3, Wand2, Loader2, 
  CheckCircle2, AlertTriangle, User, MessageCircle, Sparkles,
  Settings, ArrowUp, ArrowDown, Eye, EyeOff, ChevronUp, Ticket, MapPin, History, Star,
  Lock, PiggyBank, Bike, Package
} from 'lucide-react';
import {
  TOTAL_VILLAS, normalizeVillaNumber, classifyTarget, parseVillas, isOnlyRefills,
  isCoordinator, packageOf, isHardLiquor, parseItemLine, deliveryOf, deliveryPatch, isMissingColumn, MISSING_COLUMN_HINT, shortHHMM,
  GENERIC_RUNNER, itemsPending,
  type Delivery,
} from '@/lib/requestsShared';
import { parseStayRange } from '@/lib/guestImport';
import PackageRibbon, { PackageTag } from '@/components/PackageRibbon';
import { notifyRunners } from '@/lib/requestNotify';
import { riderDutyOf, isOffShift } from '@/app/allocation/lib/riders';
import { Home, CornerUpLeft } from 'lucide-react';
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
  is_private?: boolean;
  delivery_status?: string | null;
  taken_by?: string | null;
  taken_at?: string | null;
  pantry_by?: string | null;
  pantry_at?: string | null;
  delivered_by?: string | null;
  delivered_at?: string | null;
  reassigned_on?: string | null;
};

// Earlier minibar requests, used for the Sinner "already had this stay" spirits check.
type MbHistory = { id: string; villa_number: string; guest_name?: string; item_details: string; request_time: string; is_posted: boolean; chk_number?: string | null; is_private?: boolean };
type BankedRow = { id: string; request_id: string | null; villa_number: string; guest_name: string | null; item_name: string; qty: number; banked_at: string; banked_by: string | null; note: string | null; month_period: string };

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short' });

// Hard-liquor lines of earlier requests by the same guest since they arrived (room moves included).
const spiritsThisStay = (history: MbHistory[], guestName: string | undefined, arrIso: string, beforeIso: string, excludeId?: string | null) => {
  if (!guestName) return [] as { req: MbHistory; items: string[] }[];
  return history
    .filter(h => h.id !== excludeId && h.guest_name === guestName && (!arrIso || h.request_time >= `${arrIso}T00:00:00+06:00`) && h.request_time < beforeIso)
    .map(h => ({ req: h, items: (h.item_details || '').split('\n').map(l => parseItemLine(l)).filter(i => !i.refill && isHardLiquor(i.name)).map(i => `${i.qty}x ${i.name}`) }))
    .filter(x => x.items.length > 0)
    .sort((a, b) => a.req.request_time.localeCompare(b.req.request_time));
};

type MasterItem = {
  article_number: string;
  article_name: string;
  generic_name?: string; 
  category: string;
  is_minibar_item: boolean;
  image_url?: string; 
};

// Gen Req / GEM Req pick lists (in this order).
const REQUEST_FORM_ITEMS = [
  'First Aid', 'Hot Water Bag', 'Magnifying Mirror', 'Nail Clipper', 'Prayer Mat', 'Pumice Stone', 'Sewing Kit', 'Yoga Mat',
  'Dental Kit', 'Shaving Kit', 'Cotton Buds', 'Cotton Pads', 'Alarm Clock', 'Anti-Slip Mat', 'Bathroom Scale', 'Comb',
  'Earplugs', 'Eye Mask M', 'Eye Mask L',
];
const PILLOW_ITEMS = [
  'Body Pillow', 'Buckwheat Pillow', 'Butterfly Pillow', 'Cervical Support Pillow', 'Hypo Body Pillow', 'Isotonic Pillow',
  'Feather Firm', 'Feather Soft', 'No Snore Pillow', 'Mediflow Water Base Pillow', 'Gel and Memory Foam Pillow',
];

// Target category sorting order inside Frequent tab
const FREQUENT_CATEGORY_ORDER = [
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

// Display Tab Order in the Minibar Filter Bar
const MINIBAR_TAB_ORDER = [
  "Frequent",
  "Bites",
  "Sweets",
  "Juices",
  "Soft Drinks",
  "Water",
  "Beer",
  "Wines",
  "Spirits",
  "Retail"
];

const prevDateStr = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
};

const parseDepInfo = (remarks?: string): { name?: string; time?: string; dates?: string } | null => {
  const m = String(remarks || '').match(/\[DEP_INFO\](.*?)\[\/DEP_INFO\]/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
};

// Names saved when nobody specific was entered — replaced by the allocated VA when shown.
const GENERIC_REQUESTERS = ['', 'VA', 'STAFF', 'GEM'];

type GuestOption = {
  role: 'Departing' | 'Arriving' | 'In-house';
  mainName: string; fullName: string; mealPlan: string; stayDates: string;
  gem: string; preferences: string; time: string;
};

const nowDhakaHHMM = () =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());

// Follows the on-screen keyboard on phones so the modal (and its Save button) stays visible above it.
const useVisualViewport = (active: boolean) => {
  const [vv, setVv] = useState<{ height: number; top: number } | null>(null);
  useEffect(() => {
    if (!active || typeof window === 'undefined' || !window.visualViewport) return;
    const v = window.visualViewport;
    const update = () => setVv({ height: v.height, top: v.offsetTop });
    update();
    v.addEventListener('resize', update);
    v.addEventListener('scroll', update);
    return () => { v.removeEventListener('resize', update); v.removeEventListener('scroll', update); setVv(null); };
  }, [active]);
  return vv ? { height: vv.height, top: vv.top } : undefined;
};

const analyzePackage = (mp: string) => {
  const pkg = packageOf(mp);
  if (pkg === 'Saint') return { type: 'Saint', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  if (pkg === 'Sinner') return { type: 'Sinner', color: 'bg-orange-100 text-orange-700 border-orange-200' };
  return { type: mp || 'Std', color: 'bg-slate-100 text-slate-500 border-slate-200' };
};

const extractMainGuest = (fullString: string) => {
  if (!fullString) return 'Guest';
  const parts = fullString.split(/[\/&]/).map(s => s.trim());
  const main = parts.find(p => p.includes('Mr.') || p.includes('Mrs.') || p.includes('Dr.'));
  return main || parts[0];
};

// Hand-over button. Tap = hand to the runner (or open the choices once handed). Hold / right-click = choices.
function HandOverButton({ d, holder, onTap, onMenu }: { d: Delivery; holder: string; onTap: () => void; onMenu: () => void }) {
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = React.useRef(false);
  const cancel = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const start = () => { held.current = false; cancel(); timer.current = setTimeout(() => { held.current = true; onMenu(); }, 450); };
  const end = () => { cancel(); if (!held.current) onTap(); held.current = false; };
  const look = d === 'new' ? { cls: 'bg-slate-100 text-slate-500 hover:bg-blue-50 hover:text-blue-600', icon: <Send size={14}/>, t: 'Tap: hand to runner · Hold: VA or villa' }
      : d === 'taken' ? { cls: 'bg-blue-600 text-white shadow-xs', icon: <Bike size={14}/>, t: `With ${holder || 'runner'}` }
      : d === 'va' ? { cls: 'bg-amber-500 text-white shadow-xs', icon: <User size={14}/>, t: `With VA ${holder}` }
      : d === 'pantry' ? { cls: 'bg-amber-500 text-white shadow-xs', icon: <Package size={14}/>, t: 'At pantry' }
      : { cls: 'bg-emerald-600 text-white shadow-xs', icon: <Home size={14}/>, t: 'In villa' };
  return (
    <button
      onPointerDown={start} onPointerUp={end} onPointerLeave={cancel} onPointerCancel={cancel}
      onContextMenu={e => { e.preventDefault(); cancel(); held.current = true; onMenu(); }}
      className={`p-2 rounded-xl active:scale-90 transition-all cursor-pointer select-none [-webkit-touch-callout:none] ${look.cls}`} title={look.t}>
      {look.icon}
    </button>
  );
}

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
  const [coord, setCoord] = useState(false); // Abdulla Yamin only: private requests + banking
  const [isPrivate, setIsPrivate] = useState(false);
  const [mbHistory, setMbHistory] = useState<MbHistory[]>([]);
  const [bankedByReq, setBankedByReq] = useState<Record<string, BankedRow[]>>({});
  const [stayStart, setStayStart] = useState('');
  const [stayHistory, setStayHistory] = useState<MbHistory[]>([]);
  const [postItems, setPostItems] = useState<{ name: string; qty: number; bank: boolean }[]>([]);
  const [postIsSinner, setPostIsSinner] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [bankMonth, setBankMonth] = useState(() => getDhakaDateStr().slice(0, 7));
  const [bankRows, setBankRows] = useState<BankedRow[]>([]);
  const [handOverFor, setHandOverFor] = useState<RequestRecord | null>(null);
  
  const [currentTime, setCurrentTime] = useState(getDhakaTime());

  // Modals
  const [isMinibarOpen, setIsMinibarOpen] = useState(false);
  const [isOtherOpen, setIsOtherOpen] = useState(false);
  const [otherModalType, setOtherModalType] = useState<'General' | 'GEM'>('General');
  const [isPartialOpen, setIsPartialOpen] = useState(false);
  const [showOverdue, setShowOverdue] = useState(false); 
  const [isManageLayoutOpen, setIsManageLayoutOpen] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [postModal, setPostModal] = useState({ isOpen: false, id: '', chk: '' });
  const [selectedDate, setSelectedDate] = useState(getDhakaTime());
  
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [jettyFilter, setJettyFilter] = useState('All');
  const [villaSearch, setVillaSearch] = useState('');
  
  const [mbItemSearch, setMbItemSearch] = useState('');
  const [, setOtherItemSearch] = useState('');
  const [villaNumber, setVillaNumber] = useState('');
  const [guestOptions, setGuestOptions] = useState<GuestOption[]>([]);
  const [guestRole, setGuestRole] = useState('');
  const [editingGuestName, setEditingGuestName] = useState('');
  const [guestHistory, setGuestHistory] = useState<{ id: string; request_time: string; request_type: string; item_details: string }[]>([]);
  const [doubleVillas, setDoubleVillas] = useState<string[]>([]);
  const [mbTrayOpen, setMbTrayOpen] = useState(false);
  const guestInfo = guestOptions.find(g => g.role === guestRole) || guestOptions[0] || null;
  const [manualTime, setManualTime] = useState('');
  const [requesterSearch, setRequesterSearch] = useState('');
  
  // isBank (coordinator only): banked straight away — not sent, not on the request, nobody else sees it.
  const [mbCart, setMbCart] = useState<{name: string, qty: number, isRefill?: boolean, isBank?: boolean}[]>([]);
  const [mbCategory, setMbCategory] = useState('Frequent');
  const [otherMode, setOtherMode] = useState<'Form' | 'Pillow' | 'Note'>('Form');
  const [otherCategory, setOtherCategory] = useState('General');
  const [otherCart, setOtherCart] = useState<{name: string, qty: number}[]>([]);
  const [customNote, setCustomNote] = useState('');
  const [isMagicLoading, setIsMagicLoading] = useState(false);

  const [partialTarget, setPartialTarget] = useState<RequestRecord | null>(null);
  const [partialSelection, setPartialSelection] = useState<string[]>([]);

  // Layout customizations saved locally
  const [customMinibarOrder, setCustomMinibarOrder] = useState<string[]>([]);
  const [hiddenFromFrequent, setHiddenFromFrequent] = useState<string[]>([]);
  const [catalogSearchInManager, setCatalogSearchInManager] = useState('');
  const modalViewport = useVisualViewport(isMinibarOpen || isOtherOpen);

  useEffect(() => { 
    const sessionStr = localStorage.getItem('hk_pulse_session');
    if (sessionStr) {
        setCurrentUser(JSON.parse(sessionStr));
    }
    setCoord(isCoordinator());

    const savedOrder = localStorage.getItem('hk_minibar_custom_order');
    if (savedOrder) {
      try { setCustomMinibarOrder(JSON.parse(savedOrder)); } catch {}
    }
    const savedHidden = localStorage.getItem('hk_minibar_hidden_frequent');
    if (savedHidden) {
      try { setHiddenFromFrequent(JSON.parse(savedHidden)); } catch {}
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
      const { data, error } = await supabase.from('hsk_hosts').select('id, host_id, full_name, nicknames, role, sub_department');
      if (!error && data) {
          setAllHosts(data);
          const map: Record<string, string> = {};
          data.forEach(h => {
              if (h.id) map[h.id] = h.nicknames || h.full_name || 'Unknown VA';
          });
          setHostMap(map);
      }
  };

  // Villa -> Villa Attendant name. Only "villa" allocations count: water room, public area etc.
  // also list villa numbers in their tasks but are not the villa's attendant.
  const villaVA = useMemo(() => {
      const map: Record<string, string> = {};
      for (const alloc of dailyAllocations) {
          if (String(alloc.area || '').toLowerCase() !== 'villa') continue;
          const host = allHosts.find(h => String(h.id) === String(alloc.host_id) || String(h.host_id) === String(alloc.host_id));
          const name = host ? (host.nicknames || host.full_name || host.name) : (hostMap[alloc.host_id] || '');
          if (!name) continue;
          for (const v of parseVillas(alloc.task_details || '', doubleVillas)) {
              if (!map[v]) map[v] = name;
          }
      }
      return map;
  }, [dailyAllocations, allHosts, hostMap, doubleVillas]);

  const vaFor = (villa: string) => {
      const t = classifyTarget(villa);
      return t.kind === 'villa' ? (villaVA[t.value] || villaVA[t.base] || '') : '';
  };

  useEffect(() => {
    const fetchGuestAndVA = async () => {
      const target = classifyTarget(villaNumber);
      if (target.kind !== 'villa') {
          setGuestOptions([]);
          if (!isEditing) setRequesterSearch('');
          return;
      }

      const dateStr = getDhakaDateStr(selectedDate);
      const assignedVA = villaVA[target.value] || villaVA[target.base] || '';
      const { data } = await supabase.from('hsk_daily_summary')
        .select('*')
        .eq('report_date', dateStr)
        .in('villa_number', [target.base, `0${target.base}`])
        .limit(1)
        .maybeSingle();

      const toOption = (role: GuestOption['role'], row: any, time = ''): GuestOption => ({
          role,
          fullName: row?.guest_name || '',
          mainName: extractMainGuest(row?.guest_name || ''),
          mealPlan: row?.meal_plan || '',
          stayDates: row?.stay_dates || '',
          gem: row?.gem_name || '',
          preferences: row?.preferences || '',
          time,
      });

      const opts: GuestOption[] = [];
      if (data) {
          const st = String(data.status || '').toUpperCase();
          if (st === 'DEP/ARR') {
              // Departing guest: saved in remarks, otherwise yesterday's guest in this villa.
              const dep = parseDepInfo(data.remarks);
              const { data: prev } = await supabase.from('hsk_daily_summary')
                .select('guest_name, meal_plan, stay_dates, gem_name, preferences')
                .eq('report_date', prevDateStr(dateStr))
                .in('villa_number', [target.base, `0${target.base}`])
                .limit(1)
                .maybeSingle();
              const depName = dep?.name || prev?.guest_name || '';
              if (depName) {
                  opts.push(toOption('Departing', { ...prev, guest_name: depName, stay_dates: dep?.dates || prev?.stay_dates }, dep?.time || data.departure_time || ''));
              }
              if (data.guest_name) opts.push(toOption('Arriving', data, data.arrival_time || ''));
          } else if (data.guest_name) {
              const role = st.includes('DEP') ? 'Departing' : st.includes('ARR') ? 'Arriving' : 'In-house';
              opts.push(toOption(role, data, role === 'Departing' ? data.departure_time || '' : role === 'Arriving' ? data.arrival_time || '' : ''));
          }
      }
      setGuestOptions(opts);
      setStayStart(data?.stay_dates ? parseStayRange(data.stay_dates, dateStr).arr : '');

      // Which guest by default: the one already on the record, else departing guest for minibar, arriving for requests.
      const fromRecord = isEditing && editingGuestName ? opts.find(o => o.mainName === editingGuestName || o.fullName.includes(editingGuestName)) : undefined;
      const chosen = fromRecord || (isMinibarOpen ? opts[0] : opts[opts.length - 1]);
      setGuestRole(chosen?.role || '');

      if (!isEditing) {
          if (otherModalType === 'GEM' && isOtherOpen) setRequesterSearch(chosen?.gem || '');
          else setRequesterSearch(assignedVA);
      }
    };

    const timer = setTimeout(fetchGuestAndVA, 250);
    return () => clearTimeout(timer);
  }, [villaNumber, otherModalType, selectedDate, isMinibarOpen, isOtherOpen, villaVA, isEditing, editingGuestName]);

  // Earlier requests of the same guest (last 30 days) — shows what was already sent to them.
  useEffect(() => {
    const target = classifyTarget(villaNumber);
    if (!guestInfo?.mainName || target.kind !== 'villa' || !(isMinibarOpen || isOtherOpen)) { setGuestHistory([]); return; }
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    let cancelled = false;
    supabase.from('hsk_daily_requests')
      .select('id, request_time, request_type, item_details')
      .eq('villa_number', target.value)
      .eq('guest_name', guestInfo.mainName)
      .gte('request_time', since)
      .order('request_time', { ascending: false })
      .limit(10)
      .then(({ data }) => { if (!cancelled) setGuestHistory((data || []).filter(r => r.id !== editingId)); });
    return () => { cancelled = true; };
  }, [villaNumber, guestInfo?.mainName, isMinibarOpen, isOtherOpen, editingId]);

  // Every minibar request of this guest since arrival — any villa, so room moves are covered.
  useEffect(() => {
    if (!guestInfo?.mainName || !isMinibarOpen || packageOf(guestInfo.mealPlan) !== 'Sinner') { setStayHistory([]); return; }
    const arr = guestInfo.role === 'Departing' ? parseStayRange(guestInfo.stayDates, getDhakaDateStr(selectedDate)).arr : stayStart;
    const since = arr ? `${arr}T00:00:00+06:00` : new Date(Date.now() - 30 * 86400000).toISOString();
    let cancelled = false;
    supabase.from('hsk_daily_requests')
      .select('*')
      .eq('request_type', 'Minibar')
      .eq('guest_name', guestInfo.mainName)
      .gte('request_time', since)
      .order('request_time', { ascending: true })
      .then(({ data }) => { if (!cancelled) setStayHistory(((data || []) as MbHistory[]).filter(h => h.id !== editingId && (coord || !h.is_private))); });
    return () => { cancelled = true; };
  }, [guestInfo?.mainName, guestInfo?.mealPlan, guestInfo?.role, guestInfo?.stayDates, isMinibarOpen, stayStart, editingId, selectedDate, coord]);

  const fetchCatalog = async () => {
    const { data } = await supabase.from('hsk_master_catalog').select('*').order('article_name');
    if (data) setMasterCatalog(data);
  };

  const fetchSettings = async () => {
    const { data } = await supabase.from('hsk_constants').select('type, label').in('type', ['gem', 'double_mb_villas']).order('label');
    if (data) {
      setGems(data.filter(c => c.type === 'gem').map(c => c.label));
      const dv = data.find(c => c.type === 'double_mb_villas')?.label || '';
      setDoubleVillas(dv.split(',').map((x: string) => x.trim()).filter(Boolean));
    }
  };


  const fetchRecords = async () => {
    const dateStr = getDhakaDateStr(selectedDate);
    const dayStartStr = `${dateStr}T00:00:00+06:00`;
    const dayEndStr = `${dateStr}T23:59:59+06:00`;

    const historyFrom = new Date(new Date(dayStartStr).getTime() - 30 * 86400000).toISOString();
    const [reqRes, overdueRes, guestRes, allocRes, histRes] = await Promise.all([
        supabase.from('hsk_daily_requests').select('*').gte('request_time', dayStartStr).lte('request_time', dayEndStr).order('request_time', { ascending: false }),
        supabase.from('hsk_daily_requests').select('*').lt('request_time', dayStartStr).order('request_time', { ascending: false }).limit(100),
        supabase.from('hsk_daily_summary').select('villa_number, guest_name, meal_plan, stay_dates, status, gem_name').eq('report_date', dateStr),
        supabase.from('hsk_allocations').select('host_id, area, shift, task_details').eq('report_date', dateStr),
        supabase.from('hsk_daily_requests').select('*').eq('request_type', 'Minibar').gte('request_time', historyFrom).lte('request_time', dayEndStr).order('request_time', { ascending: false }).limit(2000),
    ]);
    
    if (allocRes.data) setDailyAllocations(allocRes.data);

    // Private requests are for the coordinator's eyes only.
    const canSeePrivate = isCoordinator();
    const visible = (r: RequestRecord) => canSeePrivate || !r.is_private;
    setMbHistory(((histRes.data || []) as MbHistory[]).filter(r => canSeePrivate || !r.is_private));

    let allRecords = (reqRes.data || []).filter(visible);
    
    if (overdueRes.data) {
        const trueOverdue = overdueRes.data.filter(visible).filter(r => {
            if (r.request_type === 'Minibar') {
                if (isOnlyRefills(r.item_details)) return !r.is_sent;
                return !r.is_sent || !r.is_posted;
            }
            return !r.is_done;
        });
        allRecords = [...allRecords, ...trueOverdue];
    }

    setRecords(allRecords);

    // What the coordinator banked on these requests (table may not exist yet → nothing banked).
    if (canSeePrivate) {
        const ids = allRecords.filter(r => r.request_type === 'Minibar').map(r => r.id);
        if (ids.length) {
            const { data: bRows } = await supabase.from('hsk_minibar_banked').select('*').in('request_id', ids);
            const map: Record<string, BankedRow[]> = {};
            for (const b of (bRows || []) as BankedRow[]) if (b.request_id) (map[b.request_id] ||= []).push(b);
            setBankedByReq(map);
        } else setBankedByReq({});
    }
    
    if (guestRes.data) {
        const gMap: Record<string, any> = {};
        guestRes.data.forEach(g => { 
          const cleanNum = normalizeVillaNumber(g.villa_number);
          gMap[cleanNum] = g;
          gMap[g.villa_number] = g;
        });
        setDailyGuests(gMap);
    }
  };

  const handleOpenModal = (type: 'Minibar' | 'General' | 'GEM') => {
    const dhakaTimeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', hour12: false });
    setManualTime(dhakaTimeFormatter.format(getDhakaTime()));
    
    setVillaNumber(''); setGuestOptions([]); setGuestRole(''); setEditingGuestName(''); setMbTrayOpen(false); setMbCart([]); setOtherCart([]); setCustomNote(''); setRequesterSearch(''); setMbItemSearch(''); setOtherItemSearch('');
    setOtherCategory('General'); setIsEditing(false); setEditingId(null); setIsPrivate(false);
    setMbCategory('Frequent');
    
    if (type === 'Minibar') setIsMinibarOpen(true);
    else { setOtherModalType(type); setOtherMode('Form'); setIsOtherOpen(true); }
  };

  const handleEditRecord = (record: RequestRecord) => {
    setIsEditing(true); 
    setEditingId(record.id);
    setVillaNumber(normalizeVillaNumber(record.villa_number));
    const dhakaTimeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', hour12: false });
    setManualTime(dhakaTimeFormatter.format(new Date(record.request_time)));
    setRequesterSearch(GENERIC_REQUESTERS.includes((record.attendant_name || '').toUpperCase()) ? '' : record.attendant_name);
    setEditingGuestName(record.guest_name || '');
    setIsPrivate(!!record.is_private);
    setMbTrayOpen(false);
    
    if (record.request_type === 'Minibar') {
      const items = (record.item_details || '').split('\n').map(line => {
        const cleanLine = line.replace(/\s*\(SENT\)$/, '');
        const match = cleanLine.match(/(\d+)x (.+)/);
        const isRef = cleanLine.includes('(Refill)');
        let n = match ? match[2] : cleanLine;
        if (isRef) n = n.replace(' (Refill)', '');
        return { name: n.trim(), qty: match ? parseInt(match[1]) : 1, isRefill: isRef };
      }).filter(i => i.name);
      const banked = coord ? (bankedByReq[record.id] || []).filter(b => b.note === 'direct').map(b => ({ name: b.item_name, qty: b.qty, isBank: true })) : [];
      setMbCart([...items, ...banked]);
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
    setMbCart(mbCart.map(i => i.name === name ? { ...i, isRefill: !i.isRefill, isBank: false } : i));
  };
  const toggleBank = (name: string) => {
    setMbCart(mbCart.map(i => i.name === name ? { ...i, isBank: !i.isBank, isRefill: false } : i));
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
        
        if (data.villa && !villaNumber) setVillaNumber(normalizeVillaNumber(data.villa));
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
        if (v && !villaNumber) setVillaNumber(normalizeVillaNumber(v));
        setCustomNote(bulleted);
        toast.success('Basic formatting applied');
    }
    setIsMagicLoading(false);
  };

  const submitRequest = async (type: 'Minibar' | 'Other') => {
    const target = classifyTarget(villaNumber);
    const cleanV = target.value;
    if (!cleanV) { toast.error("Villa or code required"); return; }
    
    let details = '';
    let reqType = 'General';

    const bankItems = type === 'Minibar' && coord ? mbCart.filter(i => i.isBank) : [];
    if (type === 'Minibar') {
        if (mbCart.length === 0) { toast.error("Add at least one Minibar item"); return; }
        const sendItems = mbCart.filter(i => !(coord && i.isBank));
        if (sendItems.length === 0 && isEditing) { toast.error("Keep at least one item to send, or delete the request"); return; }
        details = sendItems.map(i => `${i.qty}x ${i.name}${i.isRefill ? ' (Refill)' : ''}`).join('\n');
        reqType = 'Minibar';
    } else {
        // Picked items (Request Form / Pillows) plus any typed note.
        details = [...otherCart.map(i => `${i.qty}x ${i.name}`), customNote.trim()].filter(Boolean).join('\n');
        if (!details.trim()) { toast.error("Pick items or write the request"); return; }
        const onlyPillows = otherCart.length > 0 && !customNote.trim() && otherCart.every(i => PILLOW_ITEMS.includes(i.name));
        reqType = otherModalType === 'GEM' ? 'GEM Request' : onlyPillows ? 'Pillow Request' : otherCategory; 
    }

    const dateStr = getDhakaDateStr(selectedDate);
    const dbTimeStr = `${dateStr}T${manualTime}:00+06:00`; 
    
    let attendantName = requesterSearch;
    if (!attendantName) {
        if (target.kind === 'code') attendantName = 'Comp';
        else if (reqType === 'Minibar') attendantName = vaFor(cleanV) || 'VA';
        else if (reqType === 'GEM Request') attendantName = guestInfo?.gem || 'GEM';
        else attendantName = 'Staff';
    }

    const loggedByName = currentUser ? (currentUser.nicknames || currentUser.full_name || currentUser.name || 'Staff') : 'Admin';

    const payload = {
       villa_number: cleanV,
       request_type: reqType,
       item_details: details,
       request_time: dbTimeStr, 
       attendant_name: attendantName,
       guest_name: target.kind === 'villa' && guestInfo ? guestInfo.mainName : '',
       package_tag: target.kind === 'villa' && guestInfo ? analyzePackage(guestInfo.mealPlan).type : '',
       logged_by: loggedByName,
       ...(coord ? { is_private: isPrivate } : {}),
    };

 // Banked lines go to the coordinator's ledger only. "direct" = banked from the form, not from posting.
    const saveBank = async (requestId: string | null) => {
      if (requestId) await supabase.from('hsk_minibar_banked').delete().eq('request_id', requestId).eq('note', 'direct');
      if (!bankItems.length) return true;
      const now = new Date().toISOString();
      const { error: bErr } = await supabase.from('hsk_minibar_banked').insert(bankItems.map(i => ({
        request_id: requestId, villa_number: cleanV, guest_name: payload.guest_name || null, item_name: i.name, qty: i.qty,
        banked_at: now, banked_by: loggedByName, note: 'direct', month_period: dateStr.slice(0, 7),
      })));
      if (bErr) { toast.error('Banked items not saved — run the banking SQL first'); return false; }
      return true;
    };

    // Only banked items: nothing to send, so no request — straight to the Banked ledger.
    if (type === 'Minibar' && !details.trim()) {
      if (await saveBank(null)) {
        setIsMinibarOpen(false);
        toast.success(`Banked ${bankItems.map(i => `${i.qty}x ${i.name}`).join(', ')} · V${cleanV}`);
      }
      return;
    }

    const write = (body: Record<string, unknown>) => isEditing
      ? supabase.from('hsk_daily_requests').update(body).eq('id', editingId).select('id').single()
      : supabase.from('hsk_daily_requests').insert(body).select('id').single();
    let { data: saved, error } = await write(payload);
    if (error && isMissingColumn(error) && 'is_private' in payload) {
      if (isPrivate) { toast.error(MISSING_COLUMN_HINT); return; }
      const { is_private: _skip, ...rest } = payload;
      void _skip;
      ({ data: saved, error } = await write(rest));
    }
    if (!error && type === 'Minibar' && coord && (bankItems.length || isEditing)) {
      await saveBank((saved as { id: string } | null)?.id || editingId);
    }
      
    if (!error) { 
      setIsMinibarOpen(false); setIsOtherOpen(false); fetchRecords(); 
      // New, non-private request for today → ping the runners on duty.
      if (!isEditing && !(coord && isPrivate) && dateStr === getDhakaDateStr()) {
        notifyRunners(cleanV, reqType, details).then(n => toast.success(n ? `Saved · ${n} runner phone${n > 1 ? 's' : ''} notified` : 'Saved · no runner has notifications on'));
      } else toast.success(isEditing ? "Updated" : "Saved"); 
    } else {
      toast.error("Error saving request.");
      console.error(error);
    }
  };

  const handleOpenPost = (r: RequestRecord) => {
      const t = classifyTarget(r.villa_number);
      const g = t.kind === 'villa' ? (dailyGuests[t.base] || dailyGuests[r.villa_number]) : null;
      const sinner = coord && (packageOf(r.package_tag) === 'Sinner' || (!r.package_tag && packageOf(g?.meal_plan) === 'Sinner'));
      setPostIsSinner(sinner);
      if (sinner) {
          const banked = (bankedByReq[r.id] || []).filter(b => b.note !== 'direct');
          setPostItems((r.item_details || '').split('\n').map(l => parseItemLine(l)).filter(i => i.name && !i.refill)
              .map(i => ({ name: i.name, qty: i.qty, bank: banked.some(b => b.item_name === i.name) })));
      } else setPostItems([]);
      if (r.is_posted && !r.chk_number) {
          setPostModal({ isOpen: true, id: r.id, chk: '' });
      } else if (r.is_posted && r.chk_number) {
          setPostModal({ isOpen: true, id: r.id, chk: r.chk_number });
      } else {
          const chks = records.map(x => parseInt(x.chk_number || '0')).filter(n => !isNaN(n) && n > 1000000);
          const nextChk = chks.length > 0 ? Math.max(...chks) + 1 : 10703132;
          setPostModal({ isOpen: true, id: r.id, chk: nextChk.toString() });
      }
  };

  const confirmPost = async () => {
      const toBank = postIsSinner ? postItems.filter(i => i.bank) : [];
      const allBanked = postIsSinner && postItems.length > 0 && toBank.length === postItems.length;
      if (!postModal.chk && !allBanked) return toast.error("Enter CHK number");
      const chk = allBanked ? null : postModal.chk;

      // Banked items go to the coordinator's ledger instead of a bill.
      if (postIsSinner) {
          const r = records.find(x => x.id === postModal.id);
          const del = await supabase.from('hsk_minibar_banked').delete().eq('request_id', postModal.id).or('note.is.null,note.neq.direct');
          if (del.error && toBank.length) { toast.error('Banking table missing — run the SQL from the update notes.'); return; }
          if (toBank.length && r) {
              const now = new Date().toISOString();
              const rows = toBank.map(i => ({
                  request_id: r.id, villa_number: normalizeVillaNumber(r.villa_number), guest_name: r.guest_name || null,
                  item_name: i.name, qty: i.qty, banked_at: now, banked_by: myName(), month_period: getDhakaDateStr(new Date(r.request_time)).slice(0, 7),
              }));
              const { data, error } = await supabase.from('hsk_minibar_banked').insert(rows).select();
              if (error) { toast.error('Could not save the banked items.'); return; }
              setBankedByReq(prev => ({ ...prev, [r.id]: [...(prev[r.id] || []).filter(b => b.note === 'direct'), ...((data || []) as BankedRow[])] }));
          } else setBankedByReq(prev => ({ ...prev, [postModal.id]: (prev[postModal.id] || []).filter(b => b.note === 'direct') }));
      }

      await supabase.from('hsk_daily_requests').update({ is_posted: true, chk_number: chk }).eq('id', postModal.id);
      setRecords(records.map(r => r.id === postModal.id ? { ...r, is_posted: true, chk_number: chk || undefined } : r));
      setPostModal({ isOpen: false, id: '', chk: '' });
      toast.success(allBanked ? 'Banked — no bill' : toBank.length ? `Posted · ${toBank.length} item(s) banked` : 'Bill successfully linked');
  };

  const unpost = async () => {
      await supabase.from('hsk_minibar_banked').delete().eq('request_id', postModal.id).or('note.is.null,note.neq.direct');
      await supabase.from('hsk_daily_requests').update({ is_posted: false, chk_number: null }).eq('id', postModal.id);
      setRecords(records.map(r => r.id === postModal.id ? { ...r, is_posted: false, chk_number: undefined } : r));
      setBankedByReq(prev => ({ ...prev, [postModal.id]: (prev[postModal.id] || []).filter(b => b.note === 'direct') }));
      setPostModal({ isOpen: false, id: '', chk: '' });
      toast.success('Marked as not posted');
  };

  // --- Banked ledger (coordinator only) ---
  const loadBanked = async (month: string) => {
      const { data, error } = await supabase.from('hsk_minibar_banked').select('*').eq('month_period', month).order('banked_at', { ascending: false });
      if (error) { toast.error('Banking table missing — run the SQL from the update notes.'); setBankRows([]); return; }
      setBankRows((data || []) as BankedRow[]);
  };
  useEffect(() => { if (bankOpen && coord) loadBanked(bankMonth); }, [bankOpen, bankMonth, coord]);

  const deleteBanked = async (row: BankedRow) => {
      const ok = await confirmAction({ title: 'Remove banked item?', message: `${row.qty}x ${row.item_name} · V${row.villa_number} will no longer count as banked. The request stays posted.`, confirmText: 'Remove', isDestructive: true });
      if (!ok) return;
      const { error } = await supabase.from('hsk_minibar_banked').delete().eq('id', row.id);
      if (error) return toast.error('Not removed');
      setBankRows(prev => prev.filter(b => b.id !== row.id));
      if (row.request_id) setBankedByReq(prev => ({ ...prev, [row.request_id!]: (prev[row.request_id!] || []).filter(b => b.id !== row.id) }));
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

  const myName = () => currentUser ? (currentUser.nicknames || currentUser.full_name || currentUser.name || 'Coordinator') : 'Coordinator';

  // Writes a patch; if the delivery columns are not in Supabase yet, saves just the old flags.
  const updateRequest = async (id: string, patch: Record<string, unknown>, legacy: Record<string, unknown>) => {
    let { error } = await supabase.from('hsk_daily_requests').update(patch).eq('id', id);
    if (error && isMissingColumn(error)) ({ error } = await supabase.from('hsk_daily_requests').update(legacy).eq('id', id));
    if (error) { toast.error('Not saved — check your connection'); fetchRecords(); }
  };

  // Minibar "Sent" and request "Done" are the delivered step; "Informed" on a request is only a flag.
  const toggleStatus = async (id: string, field: 'is_sent' | 'is_done') => {
    const record = records.find(r => r.id === id);
    if (!record) return;
    const newValue = !record[field];
    const isDeliveryFlag = (record.request_type === 'Minibar') === (field === 'is_sent');
    const patch: Record<string, unknown> = isDeliveryFlag ? deliveryPatch(record, newValue ? 'delivered' : 'new', myName()) : { [field]: newValue };
    setRecords(prev => prev.map(r => r.id === id ? { ...r, ...patch } as RequestRecord : r));
    await updateRequest(id, patch, { [field]: newValue });
  };

  // Runners on duty on the selected day (for the hand-over button).
  const runnersOnDuty = useMemo(() => dailyAllocations
      .filter(a => a.area === 'riders' && !isOffShift(a.shift))
      .map(a => ({ a, h: allHosts.find(h => String(h.id) === String(a.host_id) || String(h.host_id) === String(a.host_id)) }))
      .filter(({ a, h }) => h && riderDutyOf(a, h) === 'Runner')
      .map(({ h }) => String(h.nicknames ? String(h.nicknames).split(',')[0].trim() : h.full_name)), [dailyAllocations, allHosts]);
  const defaultRunner = () => (runnersOnDuty.length === 1 ? runnersOnDuty[0] : GENERIC_RUNNER);

  // Office hand-over: to a runner (default), to the villa attendant, or straight into the villa.
  const handOver = async (rec: RequestRecord, to: Delivery, holder?: string) => {
      const patch: Record<string, unknown> = deliveryPatch(rec, to, myName(), holder);
      const isMb = rec.request_type === 'Minibar';
      const legacy = isMb ? { is_sent: to !== 'new', item_details: patch.item_details } : { is_done: to === 'delivered' };
      setRecords(prev => prev.map(r => r.id === rec.id ? { ...r, ...patch } as RequestRecord : r));
      setHandOverFor(null);
      await updateRequest(rec.id, patch, legacy);
      if (to === 'taken') toast.success(`Handed to ${holder || 'runner'}`);
      else if (to === 'va') toast.success(`Handed to ${holder || 'VA'}`);
      else if (to === 'delivered') toast.success('Placed in villa');
  };

  // An older open request shows on the runner / VA phones only once it is re-assigned to today.
  const reassignToday = async (rec: RequestRecord) => {
      const today = getDhakaDateStr();
      const { error } = await supabase.from('hsk_daily_requests').update({ reassigned_on: today }).eq('id', rec.id);
      if (error) return toast.error(isMissingColumn(error) ? MISSING_COLUMN_HINT : 'Not saved');
      setRecords(prev => prev.map(r => r.id === rec.id ? { ...r, reassigned_on: today } : r));
      const n = await notifyRunners(rec.villa_number, rec.request_type, rec.item_details);
      toast.success(n ? `Re-assigned · ${n} runner phone${n > 1 ? 's' : ''} notified` : 'Re-assigned to today');
  };

  const handOverButton = (rec: RequestRecord) => (
      <HandOverButton d={deliveryOf(rec)} holder={rec.taken_by || ''}
        onTap={() => (deliveryOf(rec) === 'new' ? handOver(rec, 'taken', defaultRunner()) : setHandOverFor(rec))}
        onMenu={() => setHandOverFor(rec)} />
  );

  const handleWhatsApp = (record: RequestRecord, type: 'inform' | 'done') => {
      const target = classifyTarget(record.villa_number);
      const items = (record.item_details || '')
          .split(/\n/)
          .map(s => s.trim().replace(/^[•\-\*]\s*/, ''))
          .filter(Boolean)
          .map(s => s.endsWith('(SENT)') ? `• ${s.replace(/\s*\(SENT\)$/, '')} ✅` : `• ${s}`);

      const kind = record.request_type === 'GEM Request' ? 'GEM request' : record.request_type === 'General' ? 'Request' : record.request_type;
      const title = `*${target.label}*${record.guest_name ? ` · ${record.guest_name}` : ''}`;
      const g = dailyGuests[target.base] || dailyGuests[record.villa_number];
      const requester = GENERIC_REQUESTERS.includes((record.attendant_name || '').toUpperCase()) ? '' : record.attendant_name;
      const va = vaFor(record.villa_number);
      const people = [
          va ? `VA: ${va}` : '',
          g?.gem_name ? `GEM: ${g.gem_name}` : '',
          requester && requester !== va && requester !== g?.gem_name ? `Requested by: ${requester}` : '',
      ].filter(Boolean).join('  |  ');

      const lines = type === 'inform'
          ? [title, `_${kind} · ${formatDisplayTime(record.request_time)}_`, '', ...items, ...(people ? ['', people] : [])]
          : [`✅ *DONE* — ${title}`, '', ...items, '', `_Completed ${nowDhakaHHMM()}_`];

      if (type === 'inform' && !record.is_sent) toggleStatus(record.id, 'is_sent');
      if (type === 'done' && !record.is_done) toggleStatus(record.id, 'is_done');

      window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank');
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
      
      // Some items handed over → it is with the runner; none → back at the office.
      const anySent = updatedItems.some(i => i.endsWith('(SENT)'));
      const d = deliveryOf(partialTarget);
      const step: Record<string, unknown> = !anySent ? { delivery_status: null, taken_by: null, taken_at: null }
          : d === 'new' ? { delivery_status: 'taken', taken_by: defaultRunner(), taken_at: new Date().toISOString() } : {};
      await updateRequest(partialTarget.id, { item_details: newItemDetails, is_sent: allSent, ...step }, { item_details: newItemDetails, is_sent: allSent });
          
      setIsPartialOpen(false); 
      fetchRecords();
  };

  const visibleRecords = records.filter(r => {
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
      
      const normRec = normalizeVillaNumber(r.villa_number);
      const vNum = parseInt(normRec, 10);

      if (villaSearch) {
        const q = villaSearch.toLowerCase().trim();
        const normSearch = normalizeVillaNumber(q);
        const matchesVilla = normRec.includes(normSearch) || r.villa_number.toLowerCase().includes(q);
        const matchesOther = (r.attendant_name || '').toLowerCase().includes(q) || (r.item_details || '').toLowerCase().includes(q);
        if (!matchesVilla && !matchesOther) return false;
      }

      if (jettyFilter === 'Jetty A' && !(vNum >= 1 && vNum <= 35)) return false;
      if (jettyFilter === 'Jetty B' && !(vNum >= 37 && vNum <= 50)) return false;
      if (jettyFilter === 'Jetty C' && !(vNum >= 59 && vNum <= 79)) return false;
      if (jettyFilter === 'Beach' && (!(vNum >= 1 && vNum <= TOTAL_VILLAS) || (vNum >= 1 && vNum <= 35) || (vNum >= 37 && vNum <= 50) || (vNum >= 59 && vNum <= 79))) return false;
      return true;
  });

  // --- REFINED MINIBAR CATALOG ENGINE ---
  const visibleMinibarItems = useMemo(() => {
    return masterCatalog
      .filter(i => {
        const cat = (i.category || '').toUpperCase().trim();
        const name = (i.article_name || '').toLowerCase();
        const gen = (i.generic_name || '').toLowerCase();
        const fullDesc = `${name} ${gen}`;

        // 1. Strict Item Identification
        const isWaterItem = fullDesc.includes('perrier') || fullDesc.includes('evian') || cat === 'WATER';
        const isRareWine = fullDesc.includes('dom perignon') || fullDesc.includes('krug') || fullDesc.includes('chateau') || fullDesc.includes('stags');
        const isSoftDrinkSpecial = fullDesc.includes('fanta') || fullDesc.includes('sprite');
        
        // QR Codes (NEVER allowed in minibar or retail)
        const isQrCode = fullDesc.includes('qr') || fullDesc.includes('qr code');
        if (isQrCode) return false;

        // Turtle Plush (not QR)
        const isTurtle = fullDesc.includes('turtle');
        // Manta Plush (not QR)
        const isManta = fullDesc.includes('manta');

        // Baby items & Diapers
        const isBabyWipesMinibar = fullDesc.includes('wipe') && i.is_minibar_item;
        
        // Diaper without size: Must NOT have numbers or size tags like "size", "m", "l", "xl", "3", etc.
        const isDiaperWord = fullDesc.includes('diaper') || fullDesc.includes('daiper');
        const hasSizeTag = /\b(size|small|medium|large|xl|xxl|nb|newborn|\d+)\b/i.test(fullDesc);
        const isGenericDiaperWithoutSize = isDiaperWord && !hasSizeTag;

        // User Custom Hidden
        if (hiddenFromFrequent.includes(i.article_number) && mbCategory === 'Frequent') {
          return false;
        }

        // Global search overrides tab filters
        if (mbItemSearch) {
          const q = mbItemSearch.toLowerCase().trim();
          return fullDesc.includes(q) || cat.toLowerCase().includes(q);
        }

        // 1. "Frequent" Tab
        if (mbCategory === 'Frequent') {
          // Exclude Water, Rare Wine, Baby items, Diapers, Fanta, Sprite
          if (isWaterItem) return false;
          if (isRareWine) return false;
          if (isBabyWipesMinibar) return false;
          if (isDiaperWord) return false;
          if (isSoftDrinkSpecial) return false;
          
          // Retail items in Frequent: Include Turtle and Manta at the end
          if (isTurtle || isManta) return true;

          // Exclude any other store inventory / general retail items
          if (cat.includes('RETAIL') || cat.includes('PLUSH') || cat.includes('AMENITIES')) return false;

          // Must be flagged as a true minibar item
          return i.is_minibar_item;
        }

        // 2. "Water" Tab: Perrier, Evian, and water bottles
        if (mbCategory === 'Water') {
          return isWaterItem;
        }

        // 3. "Wines" Tab: ALL wines & champagnes (Chateau, Krug, Dom Perignon, Taittinger, etc.)
        if (mbCategory === 'Wines' || mbCategory === 'Wine') {
          return cat.includes('WINE') || isRareWine;
        }

        // 4. "Soft Drinks" Tab: Includes Fanta, Sprite, Coke, Diet Coke, Tonic, Ginger Beer, etc.
        if (mbCategory === 'Soft Drinks') {
          if (isWaterItem) return false; // Perrier and Evian strictly belong to Water tab
          return cat.includes('SOFT') || isSoftDrinkSpecial;
        }

        // 5. "Retail" Tab: ONLY Baby Wipes (minibar), Diapers (without size), Manta, and Turtle
        if (mbCategory === 'Retail') {
          if (isTurtle) return true;
          if (isManta) return true;
          if (isBabyWipesMinibar) return true;
          if (isGenericDiaperWithoutSize) return true;
          return false; // No store inventory or other items!
        }

        // 6. Direct category tabs (Bites, Sweets, Juices, Beer, Spirits)
        const activeUpper = mbCategory.toUpperCase();
        return cat.includes(activeUpper);
      })
      .sort((a, b) => {
        // User custom order priority if defined
        if (customMinibarOrder.length > 0) {
          const idxA = customMinibarOrder.indexOf(a.article_number);
          const idxB = customMinibarOrder.indexOf(b.article_number);
          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
          if (idxA !== -1) return -1;
          if (idxB !== -1) return 1;
        }

        const catA = (a.category || '').toUpperCase().trim();
        const catB = (b.category || '').toUpperCase().trim();
        const descA = `${a.article_name} ${a.generic_name || ''}`.toLowerCase();
        const descB = `${b.article_name} ${b.generic_name || ''}`.toLowerCase();

        // IN FREQUENT TAB:
        // 1. Order categories: Bites -> Sweets -> Juices -> Soft Drinks -> Beer -> Wine -> Spirits
        // 2. Within Bites: BBQ Cashew Nuts FIRST, Wasabi Green Peas SECOND, then others!
        // 3. At the very end: Turtle and Manta plush!
        if (mbCategory === 'Frequent') {
          const isPlushA = descA.includes('turtle') || descA.includes('manta');
          const isPlushB = descB.includes('turtle') || descB.includes('manta');

          // Push Turtle & Manta to the very end
          if (isPlushA && !isPlushB) return 1;
          if (!isPlushA && isPlushB) return -1;
          if (isPlushA && isPlushB) {
            // Turtle before Manta
            if (descA.includes('turtle') && !descB.includes('turtle')) return -1;
            if (!descA.includes('turtle') && descB.includes('turtle')) return 1;
          }

          let indexA = FREQUENT_CATEGORY_ORDER.findIndex(o => catA.includes(o));
          let indexB = FREQUENT_CATEGORY_ORDER.findIndex(o => catB.includes(o));
          if (indexA === -1) indexA = 900;
          if (indexB === -1) indexB = 900;

          if (indexA !== indexB) return indexA - indexB;

          // Inside Bites category: BBQ Cashew first, Wasabi next!
          if (catA.includes('BITES')) {
            const isBbqA = descA.includes('bbq');
            const isBbqB = descB.includes('bbq');
            const isWasabiA = descA.includes('wasabi');
            const isWasabiB = descB.includes('wasabi');

            if (isBbqA) return -1;
            if (isBbqB) return 1;
            if (isWasabiA) return -1;
            if (isWasabiB) return 1;
          }
        }

        return (a.generic_name || a.article_name).localeCompare(b.generic_name || b.article_name);
      });
  }, [masterCatalog, mbCategory, mbItemSearch, customMinibarOrder, hiddenFromFrequent]);

  const minibarTabs = MINIBAR_TAB_ORDER;

  const moveItemInOrder = (artNo: string, direction: 'up' | 'down') => {
    const currentList = customMinibarOrder.length > 0 
      ? [...customMinibarOrder] 
      : visibleMinibarItems.map(i => i.article_number);

    const idx = currentList.indexOf(artNo);
    if (idx === -1) return;

    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= currentList.length) return;

    const temp = currentList[idx];
    currentList[idx] = currentList[newIdx];
    currentList[newIdx] = temp;

    setCustomMinibarOrder(currentList);
    localStorage.setItem('hk_minibar_custom_order', JSON.stringify(currentList));
  };

  const toggleHideItemFromFrequent = (artNo: string) => {
    const nextHidden = hiddenFromFrequent.includes(artNo)
      ? hiddenFromFrequent.filter(id => id !== artNo)
      : [...hiddenFromFrequent, artNo];
    setHiddenFromFrequent(nextHidden);
    localStorage.setItem('hk_minibar_hidden_frequent', JSON.stringify(nextHidden));
    toast.success("Updated visibility");
  };

  // Guest panel inside the modals. `full` adds preferences + earlier requests (used for extra-item requests).
  const renderGuestCard = (full: boolean) => {
      if (!villaNumber.trim()) return null;
      const target = classifyTarget(villaNumber);
      if (target.kind === 'code') {
          return (
            <div className="mt-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 flex items-center gap-2">
              <Ticket size={14} className="shrink-0"/> Complimentary code {target.value} — not a villa, no guest linked
            </div>
          );
      }
      if (target.kind === 'other') {
          return (
            <div className="mt-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-600 flex items-center gap-2">
              <MapPin size={14} className="shrink-0"/> {target.value} — not a villa, no guest linked
            </div>
          );
      }

      const va = villaVA[target.value] || villaVA[target.base] || '';
      const people = (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-bold text-slate-600 mt-1">
          <span>VA: <span className="text-slate-900">{va || '—'}</span></span>
          <span>GEM: <span className="text-slate-900">{guestInfo?.gem || '—'}</span></span>
        </div>
      );

      if (!guestInfo) {
          return (
            <div className="mt-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <span className="font-bold text-slate-500">V{target.value} · no guest in today&apos;s Guest List</span>
              {people}
            </div>
          );
      }

      const isDep = guestInfo.role === 'Departing';
      const gPkg = packageOf(guestInfo.mealPlan);
      return (
        <div className="mt-2 rounded-xl border border-slate-200 overflow-hidden text-xs bg-white">
          {gPkg && (
            <div className={`px-3 py-1 text-center text-[10px] font-black uppercase tracking-[0.25em] text-white ${gPkg === 'Sinner' ? 'bg-gradient-to-r from-orange-600 to-rose-600' : 'bg-gradient-to-r from-emerald-500 to-teal-600'}`}>
              {gPkg} package
            </div>
          )}
          {guestOptions.length > 1 && (
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100">
              {guestOptions.map(g => (
                <button key={g.role} type="button" onClick={() => setGuestRole(g.role)}
                  className={`text-left px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${guestInfo.role === g.role ? 'bg-white shadow-xs ring-1 ring-slate-200' : 'text-slate-500'}`}>
                  <span className={`block text-[9px] font-black uppercase tracking-wider ${g.role === 'Departing' ? 'text-rose-600' : 'text-blue-600'}`}>{g.role}{g.time ? ` · ${g.time}` : ''}</span>
                  <span className="block font-bold truncate text-slate-800">{g.mainName}</span>
                </button>
              ))}
            </div>
          )}
          <div className={`p-2.5 border-l-4 ${isDep ? 'border-rose-500 bg-rose-50/60' : 'border-blue-500 bg-blue-50/50'}`}>
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <h3 className="font-black text-slate-800 flex items-center gap-1.5 text-[13px]">
                  <User size={13} className="text-slate-400 shrink-0"/>
                  <span className="truncate">{guestInfo.mainName || 'Guest'}</span>
                </h3>
                <p className="text-[11px] text-slate-500 font-bold mt-0.5">
                  {guestInfo.role}{guestInfo.stayDates ? ` · ${guestInfo.stayDates}` : ''}
                </p>
              </div>
              {guestInfo.mealPlan && (
                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border bg-white shrink-0 ${analyzePackage(guestInfo.mealPlan).color}`}>{guestInfo.mealPlan}</span>
              )}
            </div>
            {people}
            {full && guestInfo.preferences && (
              <details className="mt-2 group">
                <summary className="cursor-pointer list-none flex items-start gap-1.5 text-[11px] text-slate-700">
                  <Star size={12} className="text-amber-500 shrink-0 mt-0.5"/>
                  <span className="line-clamp-2 group-open:line-clamp-none">{guestInfo.preferences}</span>
                </summary>
              </details>
            )}
            {full && guestHistory.length > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-200/70">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1 mb-1"><History size={11}/> Already sent this stay</p>
                <ul className="space-y-0.5 max-h-24 overflow-y-auto">
                  {guestHistory.map(h => (
                    <li key={h.id} className="text-[11px] text-slate-600 flex gap-2">
                      <span className="font-mono text-slate-400 shrink-0">{new Date(h.request_time).toLocaleDateString('en-GB', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short' })}</span>
                      <span className="truncate">{(h.item_details || '').replace(/\s*\(SENT\)/g, '').split('\n').map(x => x.replace(/^[•\-\*]\s*/, '').trim()).filter(Boolean).join(', ')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      );
  };

  // Coordinator-only switch inside the request forms.
  const privateToggle = coord ? (
      <button type="button" onClick={() => setIsPrivate(p => !p)}
        className={`w-full mb-2 px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 transition-colors cursor-pointer ${isPrivate ? 'bg-slate-900 border-slate-900 text-white' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
        <span className="flex items-center gap-1.5"><Lock size={13}/> Private — only you can see it</span>
        <span className={`w-9 h-5 rounded-full p-0.5 transition-colors ${isPrivate ? 'bg-emerald-400' : 'bg-slate-300'}`}>
          <span className={`block w-4 h-4 rounded-full bg-white transition-transform ${isPrivate ? 'translate-x-4' : ''}`}/>
        </span>
      </button>
  ) : null;

  // Sinner stay: spirits already sent this stay, shown while adding a minibar request.
  const renderStaySpirits = () => {
      if (packageOf(guestInfo?.mealPlan) !== 'Sinner') return null;
      const had = stayHistory
          .map(h => ({ req: h, items: (h.item_details || '').split('\n').map(l => parseItemLine(l)).filter(i => !i.refill && isHardLiquor(i.name)).map(i => `${i.qty}x ${i.name}`) }))
          .filter(x => x.items.length);
      const cartSpirits = mbCart.filter(i => !i.isRefill && isHardLiquor(i.name)).map(i => i.name.toLowerCase());
      const repeat = had.some(x => x.items.some(it => cartSpirits.some(c => it.toLowerCase().includes(c))));
      return (
        <div className={`mb-2 p-2.5 rounded-xl border text-[11px] ${repeat ? 'bg-rose-50 border-rose-300' : 'bg-orange-50 border-orange-200'}`}>
          <p className={`text-[9px] font-black uppercase tracking-wider flex items-center gap-1 mb-1 ${repeat ? 'text-rose-700' : 'text-orange-700'}`}>
            <AlertTriangle size={11}/> Sinner stay · spirits so far{repeat ? ' — already had this one' : ''}
          </p>
          {had.length === 0 ? (
            <p className="font-semibold text-slate-500">No Bacardi, Vodka or Gin yet this stay.</p>
          ) : (
            <ul className="space-y-0.5 max-h-24 overflow-y-auto">
              {had.map(({ req, items }) => (
                <li key={req.id} className="font-bold text-slate-700 flex flex-wrap gap-x-1.5">
                  <span className="font-mono text-slate-400">{fmtDay(req.request_time)}</span>
                  {normalizeVillaNumber(req.villa_number) !== classifyTarget(villaNumber).value && <span className="text-slate-400">V{normalizeVillaNumber(req.villa_number)}</span>}
                  <span>{items.join(', ')}</span>
                  <span className={req.is_posted ? 'text-emerald-700' : 'text-rose-600'}>{req.is_posted ? (req.chk_number ? `posted #${req.chk_number}` : (coord ? 'banked' : 'posted')) : 'not posted'}</span>
                </li>
              ))}
            </ul>
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
            {coord && (
              <button
                onClick={() => setBankOpen(true)}
                className="justify-center bg-violet-600 hover:bg-violet-700 active:scale-95 text-white px-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm shadow-violet-600/20 transition-all cursor-pointer"
                title="Banked minibar items (only you)"
              >
                <PiggyBank size={15} />
                <span className="hidden sm:inline">Banked</span>
              </button>
            )}
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
              <button onClick={() => setVillaSearch('')} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer">
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
             const target = classifyTarget(r.villa_number);
             
             const gInfo = target.kind === 'villa' ? (dailyGuests[target.base] || dailyGuests[r.villa_number]) : null;
             const cardVA = vaFor(r.villa_number);
             const requester = GENERIC_REQUESTERS.includes((r.attendant_name || '').toUpperCase()) ? '' : r.attendant_name;
             // On a DEP/ARR day, say which of the two guests this belongs to.
             let guestRoleTag = '';
             if (r.guest_name && String(gInfo?.status || '').toUpperCase() === 'DEP/ARR') {
                 guestRoleTag = String(gInfo?.guest_name || '').includes(r.guest_name) ? 'Arr guest' : 'Dep guest';
             }
             
             let depDate = '';
             if (gInfo?.stay_dates) {
                 const parts = gInfo.stay_dates.split('-');
                 if (parts.length > 1) depDate = parts[1].trim();
                 else depDate = gInfo.stay_dates;
             }
             
             const mealPlan = gInfo?.meal_plan || r.package_tag || '';
             const isCheckout = gInfo?.status?.includes('DEP');
             // Package of the guest this request belongs to (on DEP/ARR the saved tag tells which guest).
             const pkg = target.kind !== 'villa' ? null : (packageOf(r.package_tag) || (guestRoleTag === 'Dep guest' ? null : packageOf(gInfo?.meal_plan)));
             const delivery: Delivery = deliveryOf(r);
             const banked = bankedByReq[r.id] || [];
             const arrIso = gInfo?.stay_dates && guestRoleTag !== 'Dep guest' ? parseStayRange(gInfo.stay_dates, getDhakaDateStr(selectedDate)).arr : '';
             const priorSpirits = pkg === 'Sinner' && r.request_type === 'Minibar' && (r.item_details || '').split('\n').some(l => isHardLiquor(parseItemLine(l).name))
               ? spiritsThisStay(mbHistory, r.guest_name, arrIso, r.request_time, r.id) : [];

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
               className={`relative bg-white rounded-2xl border overflow-hidden flex flex-col justify-between transition-all ${
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
                    <div className={`${r.reassigned_on === getDhakaDateStr() ? 'bg-blue-600' : 'bg-rose-600'} text-white text-[9px] font-black px-2 py-1 w-full tracking-widest uppercase flex items-center justify-center gap-2`}>
                        <span className="flex items-center gap-1"><AlertTriangle size={10} /> Overdue (From {pastDateStr})</span>
                        {deliveryOf(r) !== 'delivered' && (r.reassigned_on === getDhakaDateStr()
                          ? <span className="px-1.5 py-0.5 rounded bg-white/20">On today&apos;s list</span>
                          : <button onClick={() => reassignToday(r)} className="px-1.5 py-0.5 rounded bg-white text-rose-700 flex items-center gap-1 cursor-pointer" title="Show it to today's runner / VA"><CornerUpLeft size={10}/> Re-assign to today</button>)}
                    </div>
                )}

                <PackageRibbon pkg={pkg} />
                <div className="p-4 flex flex-col h-full">
                    <div className={`flex justify-between items-start gap-2 mb-3 ${pkg ? 'pr-12' : ''}`}>
                       <div className="flex flex-col gap-1">
                           <div className="flex items-center gap-1.5">
                             <span className={`font-black font-mono tracking-tight leading-none ${target.kind === 'villa' ? 'text-xl text-slate-900' : 'text-base text-emerald-700 flex items-center gap-1'}`}>
                               {target.kind === 'code' && <Ticket size={15}/>}{target.label}
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
                       {r.is_private && (
                         <div className="px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider shrink-0 bg-slate-900 text-white flex items-center gap-1" title="Only you can see this request">
                           <Lock size={10}/> Private
                         </div>
                       )}
                    </div>
                    
                    {r.guest_name && (
                      <div className="-mt-1 mb-2 flex items-center gap-1.5 min-w-0">
                        <User size={12} className="text-slate-400 shrink-0"/>
                        <span className="text-xs font-bold text-slate-700 truncate">{r.guest_name}</span>
                        {guestRoleTag && (
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase shrink-0 ${guestRoleTag === 'Dep guest' ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'}`}>{guestRoleTag}</span>
                        )}
                      </div>
                    )}

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

                    {/* Where it is: taken by a runner/VA, waiting at the pantry, or in the villa */}
                    {delivery !== 'new' && (r.taken_by || r.pantry_by || r.delivered_by) && (
                      <div className={`-mt-2 mb-3 px-2.5 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5 ${
                        delivery === 'delivered' ? 'bg-emerald-50 text-emerald-700' : delivery === 'pantry' || delivery === 'va' ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-blue-50 text-blue-700'
                      }`}>
                        {delivery === 'taken' && <><Bike size={12} className="shrink-0"/> With {r.taken_by === GENERIC_RUNNER ? 'runner' : r.taken_by} · {shortHHMM(r.taken_at)}{itemsPending(r.item_details) > 0 ? ` · ${itemsPending(r.item_details)} still at office` : ''}</>}
                        {delivery === 'va' && <><User size={12} className="shrink-0"/> With VA {r.taken_by} · {shortHHMM(r.taken_at)} — to confirm in villa</>}
                        {delivery === 'pantry' && <><Package size={12} className="shrink-0"/> At pantry since {shortHHMM(r.pantry_at)} ({r.pantry_by}) — VA to confirm</>}
                        {delivery === 'delivered' && <><CheckCircle2 size={12} className="shrink-0"/> In villa · {r.delivered_by} {shortHHMM(r.delivered_at)}{r.pantry_at ? ' · via pantry' : ''}</>}
                      </div>
                    )}

                    {/* Sinner: spirits this guest already had this stay */}
                    {priorSpirits.length > 0 && (
                      <div className="-mt-1 mb-3 p-2.5 rounded-xl bg-orange-50 border border-orange-200">
                        <p className="text-[9px] font-black uppercase tracking-wider text-orange-700 flex items-center gap-1 mb-1"><AlertTriangle size={11}/> Already had this stay</p>
                        <ul className="space-y-0.5">
                          {priorSpirits.map(({ req, items }) => (
                            <li key={req.id} className="text-[10px] font-bold text-slate-700 flex flex-wrap gap-x-1.5">
                              <span className="font-mono text-slate-400">{fmtDay(req.request_time)}</span>
                              <span>{items.join(', ')}</span>
                              <span className={req.is_posted ? 'text-emerald-700' : 'text-rose-600'}>
                                {req.is_posted ? (req.chk_number ? `posted #${req.chk_number}` : (coord ? 'banked' : 'posted')) : 'not posted'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="mt-auto pt-2.5 border-t border-slate-100 flex items-end justify-between gap-2">
                       <div className="min-w-0">
                          {target.kind === 'villa' ? (
                            <div className="text-[10px] font-bold text-slate-500 uppercase flex flex-wrap gap-x-2">
                              <span>VA <span className="text-slate-800 font-black">{cardVA || (r.request_type === 'Minibar' ? requester : '') || '—'}</span></span>
                              <span>GEM <span className="text-slate-800 font-black">{gInfo?.gem_name || '—'}</span></span>
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-700 font-black uppercase truncate">{requester || (target.kind === 'code' ? 'Complimentary' : '')}</div>
                          )}
                          {requester && target.kind === 'villa' && requester !== cardVA && requester !== gInfo?.gem_name && (
                            <div className="text-[9px] text-slate-400 font-semibold mt-0.5 truncate">Req: {requester}</div>
                          )}
                          
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
                          {coord && banked.length > 0 && (
                            <div className="text-[10px] text-violet-700 font-black mt-1 flex items-center gap-1"><PiggyBank size={11}/> Banked {banked.map(b => `${b.qty}x ${b.item_name}`).join(', ')}</div>
                          )}
                          {r.logged_by && <div className="text-[9px] text-slate-400 font-semibold mt-0.5">By: {r.logged_by}</div>}
                       </div>
                       
                       <div className="flex gap-1.5 shrink-0">
                         {r.request_type === 'Minibar' ? (
                             <>
                                 <button onClick={() => openPartialModal(r)} className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 active:scale-90 transition-all cursor-pointer" title="Split Send"><Split size={14}/></button>
                                 {handOverButton(r)}
                                 
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
                                 {handOverButton(r)}
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
                  <h3 className="text-xl font-black text-[#6D2158] text-center mb-1 uppercase tracking-tight flex items-center justify-center gap-2">Post Minibar Bill {postIsSinner && <PackageTag pkg="Sinner" />}</h3>
                  <p className="text-[11px] font-bold text-slate-400 text-center mb-5 uppercase tracking-widest">{postIsSinner ? 'Post to the bill or bank each item' : 'Confirm POS Check (CHK) Number'}</p>
                  {postIsSinner && postItems.length > 0 && (
                    <div className="mb-4 space-y-1.5">
                      {postItems.map((it, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200">
                          <span className="text-xs font-bold text-slate-800 truncate">{it.qty}x {it.name}</span>
                          <div className="flex bg-white border border-slate-200 rounded-lg p-0.5 shrink-0">
                            {(['Post', 'Bank'] as const).map(opt => {
                              const on = (opt === 'Bank') === it.bank;
                              return (
                                <button key={opt} type="button" onClick={() => setPostItems(prev => prev.map((x, j) => j === i ? { ...x, bank: opt === 'Bank' } : x))}
                                  className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase cursor-pointer ${on ? (opt === 'Bank' ? 'bg-violet-600 text-white' : 'bg-emerald-600 text-white') : 'text-slate-400'}`}>
                                  {opt}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                      <p className="text-[10px] font-semibold text-slate-400 text-center pt-1">Banked items are kept in your Banked ledger only — no bill.</p>
                    </div>
                  )}
                  {!(postIsSinner && postItems.length > 0 && postItems.every(i => i.bank)) && (
                  <input 
                      type="number" 
                      className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-mono font-black text-center text-3xl text-slate-800 outline-none focus:border-[#6D2158] mb-5"
                      value={postModal.chk}
                      onChange={e => setPostModal({...postModal, chk: e.target.value})}
                      autoFocus
                      placeholder="CHK"
                  />
                  )}
                  <div className="flex gap-2.5">
                      <button onClick={() => setPostModal({isOpen: false, id: '', chk: ''})} className="flex-1 py-3.5 bg-slate-100 text-slate-600 rounded-xl font-bold uppercase text-xs hover:bg-slate-200 cursor-pointer">
                        Cancel
                      </button>
                      <button onClick={confirmPost} className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black uppercase text-xs shadow-md cursor-pointer">
                        {postIsSinner && postItems.length > 0 && postItems.every(i => i.bank) ? 'Bank all' : 'Link & Post'}
                      </button>
                  </div>
                  {records.find(r => r.id === postModal.id)?.is_posted && (
                    <button onClick={unpost} className="w-full mt-2.5 py-2 text-[11px] font-bold text-rose-500 hover:underline cursor-pointer">Mark as not posted</button>
                  )}
              </div>
          </div>
      )}

      {/* ========================================================================= */}
      {/* MINIBAR MODAL — fills large screens, follows the keyboard on phones */}
      {/* ========================================================================= */}
      {isMinibarOpen && (() => {
         const cartCount = mbCart.reduce((sum, i) => sum + i.qty, 0);
         const villaInput = (extra: string) => (
           <input
             type="text"
             enterKeyHint="done"
             autoComplete="off"
             placeholder="Villa / code"
             className={`w-28 p-2 bg-slate-50 border-2 border-rose-200 rounded-xl font-mono font-black text-center text-base text-slate-800 outline-none focus:border-rose-500 ${extra}`}
             value={villaNumber}
             onChange={e => setVillaNumber(e.target.value)}
           />
         );
         const vaInput = (
           <input
             type="text"
             placeholder="VA name"
             className="flex-1 min-w-0 p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-base md:text-sm text-slate-700 outline-none focus:border-rose-500"
             value={requesterSearch}
             onChange={e => setRequesterSearch(e.target.value)}
           />
         );
         return (
         <div className="fixed inset-x-0 top-0 h-[100dvh] bg-black/60 backdrop-blur-xs z-[9999] flex items-end md:items-center justify-center p-0 md:p-4 overflow-hidden" style={modalViewport}>
            <div className="bg-white md:rounded-3xl shadow-2xl w-full h-full md:h-[92vh] md:max-w-[min(96vw,1900px)] flex flex-col overflow-hidden md:border border-slate-200 md:animate-in md:zoom-in-95">

               {/* Header */}
               <div className="px-4 py-2.5 2xl:py-3.5 bg-white border-b border-slate-100 flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 2xl:w-10 2xl:h-10 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                      <Wine size={18}/>
                    </div>
                    <h3 className="text-base 2xl:text-xl font-black text-slate-800 leading-none truncate">
                      {isEditing ? 'Edit Minibar Log' : 'Minibar Consumption'}
                    </h3>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setIsManageLayoutOpen(true)} className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer" title="Manage Minibar Items & Order">
                      <Settings size={16}/>
                    </button>
                    <button onClick={() => setIsMinibarOpen(false)} className="bg-slate-100 hover:bg-slate-200 p-2 rounded-full text-slate-500 transition-colors cursor-pointer" aria-label="Close">
                      <X size={16}/>
                    </button>
                  </div>
               </div>

               <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">

                  {/* Product gallery */}
                  <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-slate-50/50">

                    {/* Phone: villa + VA on top */}
                    <div className="md:hidden p-2.5 bg-white border-b border-slate-200 shrink-0">
                      <div className="flex gap-2 items-center">{villaInput('')}{vaInput}</div>
                      {renderGuestCard(false)}
                    </div>

                    <div className="p-2.5 2xl:p-3.5 bg-white border-b border-slate-100 space-y-2 shrink-0">
                      <div className="relative">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                        <input
                          type="text"
                          placeholder="Search all items..."
                          className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-base md:text-sm text-slate-700 outline-none focus:bg-white focus:border-rose-500"
                          value={mbItemSearch}
                          onChange={(e) => setMbItemSearch(e.target.value)}
                        />
                        {mbItemSearch && (
                          <button onClick={() => setMbItemSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 p-1" aria-label="Clear search">
                            <X size={14} />
                          </button>
                        )}
                      </div>
                      <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                        {minibarTabs.map(c => (
                          <button
                            key={c}
                            onClick={() => setMbCategory(c)}
                            className={`px-3 py-1.5 2xl:px-4 2xl:py-2 rounded-lg text-[11px] 2xl:text-xs font-black uppercase transition-all whitespace-nowrap cursor-pointer ${
                              mbCategory === c ? 'bg-rose-600 text-white shadow-xs' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            }`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Columns stretch to fill the width, so items grow on big monitors instead of leaving white space */}
                    <div className="flex-1 min-h-0 overflow-y-auto p-2.5 2xl:p-4 grid gap-2 2xl:gap-3 content-start grid-cols-[repeat(auto-fill,minmax(100px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(124px,1fr))] 2xl:grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">
                       {visibleMinibarItems.map(item => {
                          const itemName = item.generic_name || item.article_name;
                          const inCart = mbCart.find(c => c.name === itemName);
                          return (
                            <button
                              key={item.article_number}
                              onClick={() => addToCart(itemName, 'MB')}
                              className={`bg-white p-1.5 2xl:p-2.5 rounded-xl border flex flex-col items-center gap-1 active:scale-95 transition-all group relative cursor-pointer select-none ${
                                inCart ? 'border-rose-500 ring-2 ring-rose-100 shadow-sm' : 'border-slate-200/70 hover:border-rose-300'
                              }`}
                            >
                               {inCart && (
                                 <div className="absolute top-1 right-1 bg-rose-600 text-white text-[11px] 2xl:text-sm font-black min-w-5 h-5 2xl:min-w-7 2xl:h-7 px-1 rounded-full flex items-center justify-center shadow-xs z-10">
                                   {inCart.qty}
                                 </div>
                               )}
                               <div className="w-full aspect-[4/3] bg-slate-50/60 rounded-lg flex items-center justify-center overflow-hidden p-1">
                                   {item.image_url ? (
                                     <img src={item.image_url} alt={itemName} className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"/>
                                   ) : (
                                     <Wine size={22} className="text-rose-200"/>
                                   )}
                               </div>
                               <span className="text-[11px] 2xl:text-sm font-bold text-slate-700 text-center leading-tight line-clamp-2 min-h-[2.2em] flex items-center justify-center">
                                 {itemName}
                               </span>
                            </button>
                          );
                       })}
                    </div>
                  </div>

                  {/* Order tray */}
                  <div className="w-full md:w-80 xl:w-96 2xl:w-[440px] bg-white border-t md:border-t-0 md:border-l border-slate-200 flex flex-col shrink-0 min-h-0">

                    {/* Desktop: villa + VA */}
                    <div className="hidden md:block p-3 border-b border-slate-100">
                      <div className="flex gap-2">{villaInput('')}{vaInput}</div>
                      {renderGuestCard(false)}
                    </div>

                    {/* Phone: collapsible cart summary */}
                    <button type="button" onClick={() => setMbTrayOpen(o => !o)} className="md:hidden flex items-center justify-between gap-2 px-3 py-2 text-xs font-bold text-slate-600 cursor-pointer">
                      <span className="truncate">
                        {cartCount === 0 ? 'Tap items to add' : `${cartCount} item${cartCount > 1 ? 's' : ''} · ${mbCart.map(i => `${i.qty}x ${i.name}`).join(', ')}`}
                      </span>
                      {cartCount > 0 && <ChevronUp size={16} className={`shrink-0 transition-transform ${mbTrayOpen ? '' : 'rotate-180'}`}/>}
                    </button>

                    <div className={`${mbTrayOpen ? 'block max-h-[35vh]' : 'hidden'} md:block md:flex-1 md:max-h-none overflow-y-auto px-3 pb-2 md:p-3 space-y-1.5`}>
                      <div className="hidden md:flex justify-between items-center mb-1">
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Selected items ({cartCount})</span>
                        {mbCart.length > 0 && <button onClick={() => setMbCart([])} className="text-[10px] font-bold text-rose-500 hover:underline cursor-pointer">Clear</button>}
                      </div>
                      {mbCart.length === 0 ? (
                        <div className="hidden md:block py-16 text-center text-slate-300 text-xs font-bold">Tap a product to add it</div>
                      ) : (
                        mbCart.map(i => (
                          <div key={i.name} className={`p-2 rounded-xl border flex items-center justify-between gap-2 ${i.isBank ? 'bg-violet-50 border-violet-200' : 'bg-slate-50 border-slate-200'}`}>
                            <div className="min-w-0 flex-1">
                              <span className="text-xs 2xl:text-sm font-bold text-slate-800 block truncate leading-tight">{i.name}</span>
                              <div className="mt-1 flex gap-1">
                                <button
                                  onClick={() => toggleRefill(i.name)}
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase transition-all cursor-pointer ${i.isRefill ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}
                                >
                                  {i.isRefill ? '✓ Refill' : '+ Refill'}
                                </button>
                                {coord && (
                                  <button
                                    onClick={() => toggleBank(i.name)}
                                    title="Bank it: not sent, not on the request — only in your Banked ledger"
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase transition-all cursor-pointer flex items-center gap-0.5 ${i.isBank ? 'bg-violet-600 text-white' : 'bg-slate-200 text-slate-500 hover:bg-violet-100 hover:text-violet-700'}`}
                                  >
                                    <PiggyBank size={10}/> {i.isBank ? 'Bank' : '+ Bank'}
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200 shrink-0">
                              <button onClick={() => updateCartQty(i.name, -1, 'MB')} className="w-8 h-8 md:w-6 md:h-6 rounded bg-slate-100 hover:bg-rose-100 hover:text-rose-600 flex items-center justify-center text-slate-600 cursor-pointer" aria-label="Less"><Minus size={12}/></button>
                              <span className="w-6 text-center font-mono font-black text-sm text-slate-800">{i.qty}</span>
                              <button onClick={() => updateCartQty(i.name, 1, 'MB')} className="w-8 h-8 md:w-6 md:h-6 rounded bg-slate-100 hover:bg-emerald-100 hover:text-emerald-600 flex items-center justify-center text-slate-600 cursor-pointer" aria-label="More"><Plus size={12}/></button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="p-3 border-t border-slate-200 bg-white" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
                      {renderStaySpirits()}
                      {privateToggle}
                      <button
                        onClick={() => submitRequest('Minibar')}
                        className="w-full py-3.5 2xl:py-4 bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white rounded-xl text-sm 2xl:text-base font-black uppercase tracking-wider shadow-md shadow-rose-600/20 transition-all cursor-pointer"
                      >
                        {(() => {
                          const banked = coord ? mbCart.filter(i => i.isBank).reduce((s2, i) => s2 + i.qty, 0) : 0;
                          const send = cartCount - banked;
                          if (banked && !send) return `Bank only (${banked})`;
                          return `${isEditing ? 'Confirm Update' : `Save Minibar (${send})`}${banked ? ` + bank ${banked}` : ''}`;
                        })()}
                      </button>
                    </div>
                  </div>
               </div>
            </div>
         </div>
         );
      })()}

      {/* ========================================================================= */}
      {/* MANAGE MINIBAR LAYOUT & ITEMS MODAL                                      */}
      {/* ========================================================================= */}
      {isManageLayoutOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[10000] flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden border border-slate-200">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h3 className="text-base font-black text-slate-800">Customize Minibar Layout & Order</h3>
                <p className="text-[11px] text-slate-400 font-bold">Reorder items, hide non-minibar items, or prioritize favorites</p>
              </div>
              <button onClick={() => setIsManageLayoutOpen(false)} className="p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer">
                <X size={16}/>
              </button>
            </div>

            <div className="p-3 border-b border-slate-100 bg-slate-50">
              <input 
                type="text" 
                placeholder="Filter items to configure..." 
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-rose-500"
                value={catalogSearchInManager}
                onChange={e => setCatalogSearchInManager(e.target.value)}
              />
            </div>

            <div className="flex-1 overflow-y-auto p-3 divide-y divide-slate-100">
              {masterCatalog
                .filter(i => {
                  if (!catalogSearchInManager) return i.is_minibar_item;
                  const q = catalogSearchInManager.toLowerCase();
                  return (i.article_name || '').toLowerCase().includes(q) || (i.generic_name || '').toLowerCase().includes(q);
                })
                .map((item) => {
                  const isHidden = hiddenFromFrequent.includes(item.article_number);
                  return (
                    <div key={item.article_number} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-800 truncate">
                            {item.generic_name || item.article_name}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-slate-100 text-slate-500">
                            {item.category}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 block mt-0.5">Art #{item.article_number}</span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button 
                          onClick={() => toggleHideItemFromFrequent(item.article_number)}
                          className={`p-1.5 rounded-lg border text-xs font-bold flex items-center gap-1 cursor-pointer ${
                            isHidden 
                              ? 'bg-rose-50 text-rose-600 border-rose-200' 
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                          title={isHidden ? "Hidden from Frequent" : "Visible in Frequent"}
                        >
                          {isHidden ? <EyeOff size={13}/> : <Eye size={13}/>}
                          <span className="text-[10px]">{isHidden ? 'Hidden' : 'Visible'}</span>
                        </button>

                        <button 
                          onClick={() => moveItemInOrder(item.article_number, 'up')}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
                          title="Move Up"
                        >
                          <ArrowUp size={13}/>
                        </button>
                        <button 
                          onClick={() => moveItemInOrder(item.article_number, 'down')}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
                          title="Move Down"
                        >
                          <ArrowDown size={13}/>
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="p-3 border-t border-slate-200 flex justify-end gap-2 bg-white">
              <button 
                onClick={() => {
                  setCustomMinibarOrder([]);
                  setHiddenFromFrequent([]);
                  localStorage.removeItem('hk_minibar_custom_order');
                  localStorage.removeItem('hk_minibar_hidden_frequent');
                  toast.success("Reset to defaults");
                }}
                className="px-3 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                Reset to Default
              </button>
              <button 
                onClick={() => setIsManageLayoutOpen(false)}
                className="px-5 py-2 rounded-xl text-xs font-black uppercase text-white bg-slate-800 hover:bg-slate-900 cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* GENERAL & GEM REQUEST MODAL                                               */}
      {/* ========================================================================= */}
      {isOtherOpen && (
         <div className="fixed inset-x-0 top-0 h-[100dvh] bg-black/60 backdrop-blur-xs z-[9999] flex items-end md:items-center justify-center p-0 md:p-4" style={modalViewport}>
            <div className={`bg-white rounded-t-3xl md:rounded-3xl shadow-2xl w-full max-w-4xl 2xl:max-w-6xl h-full max-h-full md:h-[82vh] flex flex-col overflow-hidden border border-slate-200 animate-in slide-in-from-bottom-6 md:zoom-in-95 ${otherModalType === 'GEM' ? 'border-t-4 border-t-amber-400' : ''}`}>
               
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
                       enterKeyHint="done"
                       autoComplete="off"
                       placeholder="Villa / code" 
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
                  
                  {renderGuestCard(true)}
                  
                  {/* Picked so far (from either list) */}
                  {otherCart.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 p-3 bg-purple-50/60 rounded-2xl border border-purple-100">
                      {otherCart.map(item => (
                        <span key={item.name} className="px-2.5 py-1 bg-[#6D2158] text-white rounded-xl text-xs font-bold flex items-center gap-1.5">
                          {item.qty}x {item.name}
                          <button onClick={() => updateCartQty(item.name, -item.qty, 'Other')} className="hover:text-rose-200 cursor-pointer" aria-label={`Remove ${item.name}`}>
                            <X size={13}/>
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1.5 rounded-2xl">
                     {([['Form', 'Request Form', REQUEST_FORM_ITEMS], ['Pillow', 'Pillow Request', PILLOW_ITEMS], ['Note', 'Note', null]] as const).map(([k, label, list]) => {
                       const n = list ? otherCart.filter(c => (list as readonly string[]).includes(c.name)).reduce((s2, c) => s2 + c.qty, 0) : (customNote.trim() ? 1 : 0);
                       return (
                         <button key={k} onClick={() => setOtherMode(k)}
                           className={`py-2.5 rounded-xl text-[11px] sm:text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1 ${otherMode === k ? 'bg-white shadow-xs text-[#6D2158]' : 'text-slate-500'}`}>
                           {label}{n > 0 && <span className="px-1.5 rounded-md bg-[#6D2158] text-white text-[10px]">{list ? n : '✓'}</span>}
                         </button>
                       );
                     })}
                  </div>
                  
                  {otherMode !== 'Note' ? (
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {(otherMode === 'Pillow' ? PILLOW_ITEMS : REQUEST_FORM_ITEMS).map((name, idx) => {
                          const inCart = otherCart.find(c => c.name === name);
                          return (
                            <div key={name} className={`flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-xl border transition-colors ${inCart ? 'bg-[#6D2158]/[0.05] border-[#6D2158]/30' : 'bg-white border-slate-200'}`}>
                              {otherMode === 'Pillow' && <span className="w-5 text-[10px] font-black text-slate-300 shrink-0">{idx + 1}</span>}
                              <button onClick={() => addToCart(name, 'Other')} className="flex-1 min-w-0 text-left py-1 text-sm font-bold text-slate-700 truncate cursor-pointer">{name}</button>
                              {inCart ? (
                                <div className="flex items-center gap-1 shrink-0">
                                  <button onClick={() => updateCartQty(name, -1, 'Other')} className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 cursor-pointer" aria-label="Less"><Minus size={13}/></button>
                                  <span className="w-6 text-center font-mono font-black text-sm text-[#6D2158]">{inCart.qty}</span>
                                  <button onClick={() => updateCartQty(name, 1, 'Other')} className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 cursor-pointer" aria-label="More"><Plus size={13}/></button>
                                </div>
                              ) : (
                                <button onClick={() => addToCart(name, 'Other')} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-[#6D2158] hover:text-white flex items-center justify-center text-slate-500 shrink-0 cursor-pointer" aria-label={`Add ${name}`}><Plus size={14}/></button>
                              )}
                            </div>
                          );
                        })}
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
                  {privateToggle}
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

      {/* HAND-OVER CHOICES */}
      {handOverFor && (() => {
          const rec = records.find(x => x.id === handOverFor.id) || handOverFor;
          const d = deliveryOf(rec);
          const va = vaFor(rec.villa_number);
          const opt = (key: string, label: string, sub: string, icon: React.ReactNode, active: boolean, onClick: () => void, tone: string) => (
              <button key={key} onClick={onClick} className={`w-full p-3 rounded-2xl border-2 flex items-center gap-3 text-left cursor-pointer transition-colors ${active ? `${tone} border-current` : 'bg-white border-slate-100 hover:border-slate-200'}`}>
                  <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${active ? 'bg-white/70' : 'bg-slate-100 text-slate-500'}`}>{icon}</span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-black text-slate-800">{label}</span><span className="block text-[11px] font-semibold text-slate-500 truncate">{sub}</span></span>
                  {active && <CheckCircle2 size={18} className="shrink-0"/>}
              </button>
          );
          const runners = runnersOnDuty.length ? runnersOnDuty : [];
          return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setHandOverFor(null)}>
              <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm p-5 pb-8 sm:pb-5 shadow-2xl space-y-2" onClick={e => e.stopPropagation()}>
                  <div className="text-center mb-2">
                      <h3 className="text-lg font-black text-slate-800">Hand over · {classifyTarget(rec.villa_number).label}</h3>
                      <p className="text-[11px] font-semibold text-slate-400 truncate">{(rec.item_details || '').replace(/\s*\(SENT\)/g, '').split('\n').filter(Boolean).join(', ')}</p>
                  </div>
                  {runners.length > 1 && opt('any', 'Runner', 'Whoever is on runner duty', <Bike size={18}/>, d === 'taken' && rec.taken_by === GENERIC_RUNNER, () => handOver(rec, 'taken', GENERIC_RUNNER), 'bg-blue-50 text-blue-700')}
                  {(runners.length ? runners : [GENERIC_RUNNER]).map(n => opt(`r-${n}`, runners.length > 1 ? n : `Runner${runners.length === 1 ? ` · ${n}` : ''}`, 'Handed to the runner', <Bike size={18}/>, d === 'taken' && (rec.taken_by === n || runners.length <= 1), () => handOver(rec, 'taken', n), 'bg-blue-50 text-blue-700'))}
                  {classifyTarget(rec.villa_number).kind === 'villa' && opt('va', `Villa attendant${va ? ` · ${va}` : ''}`, 'They confirm once it is in the villa', <User size={18}/>, d === 'va', () => handOver(rec, 'va', va || 'VA'), 'bg-amber-50 text-amber-800')}
                  {opt('villa', 'In the villa', 'Delivered — done', <Home size={18}/>, d === 'delivered', () => handOver(rec, 'delivered'), 'bg-emerald-50 text-emerald-700')}
                  {d !== 'new' && (
                    <button onClick={() => handOver(rec, 'new')} className="w-full py-2.5 text-xs font-bold text-rose-500 hover:underline cursor-pointer">Not sent — still at the office</button>
                  )}
              </div>
          </div>
          );
      })()}

      {/* BANKED LEDGER — coordinator only */}
      {bankOpen && coord && (() => {
          const totals = new Map<string, number>();
          for (const b of bankRows) totals.set(b.item_name, (totals.get(b.item_name) || 0) + b.qty);
          const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
          return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setBankOpen(false)}>
              <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-2xl max-h-[90dvh] flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 shrink-0">
                      <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0"><PiggyBank size={20}/></div>
                      <div className="min-w-0 flex-1">
                          <h3 className="text-base font-black text-slate-800 leading-tight">Banked minibar</h3>
                          <p className="text-[11px] font-semibold text-slate-400">Sinner items held against variance · only you can see this</p>
                      </div>
                      <input type="month" value={bankMonth} onChange={e => setBankMonth(e.target.value)} className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none" />
                      <button onClick={() => setBankOpen(false)} className="p-2 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 cursor-pointer" aria-label="Close"><X size={16}/></button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                      {bankRows.length === 0 ? (
                          <p className="text-center py-12 text-xs font-bold text-slate-400">Nothing banked this month.</p>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {sorted.map(([name, qty]) => (
                                  <div key={name} className="p-3 rounded-xl bg-violet-50 border border-violet-100">
                                      <p className="text-2xl font-black text-violet-700 leading-none">{qty}</p>
                                      <p className="text-[11px] font-bold text-slate-600 mt-1 truncate">{name}</p>
                                  </div>
                              ))}
                          </div>
                          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                              {bankRows.map(b => (
                                  <div key={b.id} className="px-3 py-2.5 flex items-center gap-3 text-xs">
                                      <span className="font-mono font-black text-slate-800 w-10 shrink-0">V{b.villa_number}</span>
                                      <div className="min-w-0 flex-1">
                                          <p className="font-bold text-slate-800 truncate">{b.qty}x {b.item_name}</p>
                                          <p className="text-[10px] font-semibold text-slate-400 truncate">{fmtDay(b.banked_at)} · {b.guest_name || 'Guest'}{b.banked_by ? ` · by ${b.banked_by}` : ''}</p>
                                      </div>
                                      <button onClick={() => deleteBanked(b)} className="p-1.5 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 cursor-pointer" title="Remove"><Trash2 size={14}/></button>
                                  </div>
                              ))}
                          </div>
                        </>
                      )}
                  </div>
              </div>
          </div>
          );
      })()}

      {/* PARTIAL DISPATCH MODAL */}
      {isPartialOpen && partialTarget && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4">
              <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm p-6 pb-8 sm:pb-6 shadow-2xl animate-in slide-in-from-bottom-6 sm:zoom-in-95">
                  <h3 className="text-lg font-black text-slate-800 mb-1 flex items-center justify-center gap-2 uppercase tracking-tight">
                    <Split size={18}/> Partial Dispatch (V{normalizeVillaNumber(partialTarget.villa_number)})
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
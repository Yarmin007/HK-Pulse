"use client";
import React, { useState, useEffect, useRef } from 'react';
import { 
  Settings, Save, Plus, Trash2, X, Search, Edit3, Image as ImageIcon,
  Layers, MapPin, Briefcase, Tag, AlertTriangle, Calendar, Building,
  Coffee, Droplet, Beer, Wine, Cookie, Zap, User, Eye, CheckCircle2,
  Cloud, Moon, Sun, Umbrella, Baby, Star, Box, Users, CheckCircle, Loader2, UploadCloud, Lock, Clock, ShoppingCart,
  Shield, KeyRound, History, Plane, Download, FileSpreadsheet, Merge, QrCode, ChevronUp, ChevronDown
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';

const CATEGORY_ICONS: any = {
  'Soft Drinks': Coffee, 'Juices': Coffee, 'Water': Droplet,
  'Beer': Beer, 'Wines': Wine, 'Spirits': Wine,
  'Bites': Cookie, 'Sweets': Cookie, 'Retail': Zap,
  'Pillow Menu': Cloud, 'Baby Items': Baby, 'Toiletries': Droplet,
  'Guest Amenities': Star,
  'General Requests': Box, 'Chemicals': AlertTriangle, 'Linen': Layers, 'Bottle': Droplet
};

const MINIBAR_CATEGORIES = [
  'Bites', 'Sweets', 'Soft Drinks', 'Juices', 'Water', 'Beer', 'Spirits', 'Wines', 'Retail'
];

type MasterItem = {
  article_number: string;
  hk_no: string | null; 
  article_name: string;   
  generic_name: string;   
  unit: string;
  category: string;
  sub_category?: string;
  is_minibar_item: boolean;
  micros_name: string;    
  sales_price: number;
  avg_cost: number;
  sort_order: number;
  image_url?: string; 
  has_expiry: boolean; 
  par_level: number;
  reorder_qty: number;
  primary_supplier: string;
  inventory_type?: string; 
  legacy_ids?: string;
};

type Constant = { id: string; type: string; label: string; };
type Host = { id: string; full_name: string; host_id: string; role: string; status?: string; image_url?: string | null; system_role?: string; pin?: string; requires_pin_change?: boolean; };

// --- HELPER COMPONENTS ---
const ListManager = ({ type, title, description, icon, placeholder, constants, newConstantValue, activeConstantType, setActiveConstantType, setNewConstantValue, handleAddConstant, handleDeleteConstant }: any) => {
  const list = constants.filter((c: any) => c.type === type);
  return (
    <SettingsCard icon={icon} title={title} description={description}>
      <div className="flex gap-2 mb-3">
        <input type="text" placeholder={placeholder} className="flex-1 min-w-0 px-3 py-2.5 border border-slate-200 rounded-xl font-semibold text-sm bg-slate-50 outline-none focus:border-[#6D2158] focus:bg-white" value={activeConstantType === type ? newConstantValue : ''} onChange={(e) => { setActiveConstantType(type); setNewConstantValue(e.target.value); }} onKeyDown={(e) => { if (e.key === 'Enter') handleAddConstant(type); }}/>
        <button onClick={() => handleAddConstant(type)} className="px-4 bg-[#6D2158] text-white rounded-xl font-bold uppercase text-xs flex items-center gap-1"><Plus size={14}/> Add</button>
      </div>
      <div className="flex flex-wrap gap-1.5 max-h-64 overflow-y-auto">
         {list.length === 0 && <p className="text-xs text-slate-400 italic">Nothing added yet.</p>}
         {list.map((item: any) => (
           <span key={item.id} className="inline-flex items-center gap-1 pl-3 pr-1 py-1 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700">
              {item.label}
              <button onClick={() => handleDeleteConstant(item.id)} className="p-1 rounded text-slate-300 hover:text-rose-500 hover:bg-rose-50" title="Remove"><X size={13}/></button>
           </span>
         ))}
      </div>
    </SettingsCard>
  );
};

// Designation order (role_rank constants "Name::rank"). Rank 1 = top; used to sort hosts everywhere.
const DesignationOrder = ({ constants, hosts, fetchConstants, handleDeleteConstant }: { constants: Constant[]; hosts: Host[]; fetchConstants: () => void; handleDeleteConstant: (id: string) => void }) => {
  const list = constants.filter(c => c.type === 'role_rank')
    .map(c => { const [name, rank] = c.label.split('::'); return { id: c.id, name: (name || '').trim(), rank: parseInt(rank || '999', 10) }; })
    .sort((a, b) => a.rank - b.rank);
  const [busy, setBusy] = useState(false);
  const counts = new Map<string, number>();
  hosts.filter(h => h.status !== 'Resigned').forEach(h => { const k = (h.role || '').trim().toLowerCase(); counts.set(k, (counts.get(k) || 0) + 1); });
  const unranked = Array.from(new Set(hosts.filter(h => h.status !== 'Resigned').map(h => (h.role || '').trim()).filter(Boolean)))
    .filter(r => !list.some(l => l.name.toLowerCase() === r.toLowerCase()));

  // Rewrites ranks as 1..n in the new order.
  const saveOrder = async (ordered: typeof list) => {
    setBusy(true);
    const changed = ordered.map((d, i) => ({ ...d, newRank: i + 1 })).filter(d => d.rank !== d.newRank);
    await Promise.all(changed.map(d => supabase.from('hsk_constants').update({ label: `${d.name}::${d.newRank}` }).eq('id', d.id)));
    await fetchConstants();
    setBusy(false);
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    saveOrder(next);
  };
  const addUnranked = async (name: string) => {
    const rank = Math.max(0, ...list.map(l => (l.rank < 999 ? l.rank : 0))) + 1;
    await supabase.from('hsk_constants').insert({ type: 'role_rank', label: `${name}::${rank}` });
    fetchConstants();
  };

  return (
    <SettingsCard icon={Briefcase} title="Designation order" description="Top to bottom is how hosts are sorted on attendance, allocation and the hosts page. Add or rename designations on the Hosts page.">
      {unranked.length > 0 && (
        <div className="mb-3 p-3 rounded-xl bg-amber-50 border border-amber-100">
          <p className="text-[11px] font-bold text-amber-700 mb-2">In use but not in the order yet:</p>
          <div className="flex flex-wrap gap-1.5">
            {unranked.map(r => (
              <button key={r} onClick={() => addUnranked(r)} className="px-2.5 py-1 rounded-lg bg-white border border-amber-200 text-[11px] font-bold text-amber-800 hover:bg-amber-100 flex items-center gap-1"><Plus size={12}/> {r}</button>
            ))}
          </div>
        </div>
      )}
      <div className={`divide-y divide-slate-100 border border-slate-100 rounded-xl ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
        {list.map((d, i) => {
          const n = counts.get(d.name.toLowerCase()) || 0;
          return (
            <div key={d.id} className="flex items-center gap-3 px-3 py-2 group">
              <span className="w-6 text-center text-[11px] font-mono font-bold text-slate-300">{i + 1}</span>
              <span className="flex-1 min-w-0 truncate text-sm font-semibold text-slate-700">{d.name}</span>
              <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">{n} host{n === 1 ? '' : 's'}</span>
              <div className="flex">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-[#6D2158] disabled:opacity-20" title="Move up"><ChevronUp size={15}/></button>
                <button onClick={() => move(i, 1)} disabled={i === list.length - 1} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-[#6D2158] disabled:opacity-20" title="Move down"><ChevronDown size={15}/></button>
                <button onClick={() => n ? toast.error('Still in use — change those hosts first') : handleDeleteConstant(d.id)} className={`p-1.5 rounded-lg ${n ? 'text-slate-200' : 'text-slate-400 hover:bg-rose-50 hover:text-rose-500'}`} title={n ? 'In use' : 'Remove'}><Trash2 size={14}/></button>
              </div>
            </div>
          );
        })}
      </div>
    </SettingsCard>
  );
};

const SettingsCard = ({ icon: Icon, title, description, children, className = '' }: { icon: React.ElementType; title: string; description?: string; children: React.ReactNode; className?: string }) => (
  <section className={`bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 ${className}`}>
    <div className="flex items-start gap-3 mb-4">
      <div className="w-9 h-9 rounded-xl bg-[#6D2158]/5 text-[#6D2158] flex items-center justify-center shrink-0"><Icon size={18}/></div>
      <div className="min-w-0">
        <h3 className="text-base font-bold text-slate-800 leading-tight">{title}</h3>
        {description && <p className="text-xs text-slate-500 mt-0.5 leading-snug">{description}</p>}
      </div>
    </div>
    {children}
  </section>
);

type SectionKey = 'Master List' | 'Minibar Menu' | 'Linen Catalog' | 'Bottle Catalog' | 'Expiry Setup' | 'Access Control' | 'GEM Directory' | 'General' | 'Lists';
const SECTIONS: { group: string; items: { key: SectionKey; label: string; icon: React.ElementType; desc: string }[] }[] = [
  { group: 'Catalog', items: [
    { key: 'Master List', label: 'Amenities & items', icon: Box, desc: 'Guest amenities, requests and general items used across the app.' },
    { key: 'Minibar Menu', label: 'Minibar menu', icon: Coffee, desc: 'Minibar products, prices and sort order.' },
    { key: 'Linen Catalog', label: 'Linen', icon: Layers, desc: 'Linen items counted in linen inventory.' },
    { key: 'Bottle Catalog', label: 'Bottles', icon: Droplet, desc: 'Bottle items counted in bottle inventory.' },
    { key: 'Expiry Setup', label: 'Expiry batches', icon: Calendar, desc: 'Items with expiry tracking and their active batch dates.' },
  ]},
  { group: 'Team', items: [
    { key: 'Access Control', label: 'Logins & access', icon: Shield, desc: 'Who is admin, whose team each person can see on the dashboard, and PIN resets. Resigned hosts are not listed and cannot log in.' },
    { key: 'GEM Directory', label: 'GEM directory', icon: Star, desc: 'Guest Experience Makers shown on requests and the guest list.' },
  ]},
  { group: 'System', items: [
    { key: 'General', label: 'General', icon: Settings, desc: 'Timezone and public holidays.' },
    { key: 'Lists', label: 'Lists & order', icon: Briefcase, desc: 'Dropdown lists used across the app and the designation order.' },
  ]},
];
const ALL_SECTIONS = SECTIONS.flatMap(g => g.items);

// --- MAIN PAGE ---

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SectionKey>('Master List');
  const [accessFilter, setAccessFilter] = useState<'all' | 'admin' | 'team' | 'pin'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [masterList, setMasterList] = useState<MasterItem[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [originalArticleNumber, setOriginalArticleNumber] = useState<string>(''); // To track ID changes
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  
  const [csvPreviewData, setCsvPreviewData] = useState<any[] | null>(null);

  const [mergeModalItem, setMergeModalItem] = useState<MasterItem | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [isMerging, setIsMerging] = useState(false);

  // NEW: Printing QR
  const [qrModalItem, setQrModalItem] = useState<MasterItem | null>(null);

  const defaultItemState: MasterItem = {
    article_number: '', hk_no: '', article_name: '', generic_name: '', unit: 'Each', category: 'General Requests', sub_category: '',
    is_minibar_item: false, micros_name: '', sales_price: 0, avg_cost: 0, sort_order: 0,
    image_url: '', has_expiry: false, par_level: 0, reorder_qty: 0, primary_supplier: '', inventory_type: '', legacy_ids: ''
  };
  
  const [currentItem, setCurrentItem] = useState<MasterItem>(defaultItemState);
  const [constants, setConstants] = useState<Constant[]>([]);
  const [newConstantValue, setNewConstantValue] = useState('');
  const [activeConstantType, setActiveConstantType] = useState('');

  const [systemTimezone, setSystemTimezone] = useState('Indian/Maldives');

  const [gemName, setGemName] = useState('');
  const [gemMvpn, setGemMvpn] = useState('');

  const [hosts, setHosts] = useState<Host[]>([]);
  const [hostSearch, setHostSearch] = useState('');
  const [selectedLogHost, setSelectedLogHost] = useState<Host | null>(null);
  const [hostLogs, setHostLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const [configId, setConfigId] = useState<string | null>(null);
  const [supervisorAccess, setSupervisorAccess] = useState<Record<string, string[]>>({});
  const [accessModalHost, setAccessModalHost] = useState<Host | null>(null);
  const [accessSearchQuery, setAccessSearchQuery] = useState('');

  const [holidayName, setHolidayName] = useState('');
  const [holidayDate, setHolidayDate] = useState('');

  const [selectedExpiryItem, setSelectedExpiryItem] = useState<MasterItem | null>(null);
  const [itemBatches, setItemBatches] = useState<any[]>([]);
  const [newBatchDate, setNewBatchDate] = useState('');
  const [isLoadingBatches, setIsLoadingBatches] = useState(false);

  // DUPLICATE DETECTOR STATE
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  useEffect(() => { fetchMasterList(); fetchConstants(); fetchHosts(); }, []);

  const fetchMasterList = async () => {
    const { data } = await supabase.from('hsk_master_catalog').select('*').order('article_name');
    if (data) setMasterList(data);
  };

  const fetchConstants = async () => {
    const { data } = await supabase.from('hsk_constants').select('*').order('label');
    if (data) {
        setConstants(data);
        const tz = data.find((c: Constant) => c.type === 'system_timezone')?.label || 'Indian/Maldives';
        setSystemTimezone(tz);

        const tConf = data.find((c: Constant) => c.type === 'team_viewer_config');
        if (tConf) {
            setConfigId(tConf.id);
            try { 
                const parsed = JSON.parse(tConf.label);
                setSupervisorAccess(parsed.supervisorAccess || {}); 
            } catch(e){}
        }
    }
  };

  const fetchHosts = async () => {
    const [hostRes, constRes] = await Promise.all([
        supabase.from('hsk_hosts').select('*'),
        supabase.from('hsk_constants').select('*').eq('type', 'role_rank')
    ]);
    
    if (hostRes.data) {
        let roleRanks: Record<string, number> = {};
        if (constRes.data) {
            constRes.data.forEach((c: Constant) => {
                const [role, rank] = c.label.split('::');
                if (role && rank) roleRanks[role.toLowerCase().trim()] = parseInt(rank, 10);
            });
        }
        const sortedHosts = [...hostRes.data].sort((a: any, b: any) => {
            const rankA = roleRanks[(a.role || '').toLowerCase().trim()] ?? 999;
            const rankB = roleRanks[(b.role || '').toLowerCase().trim()] ?? 999;
            if (rankA !== rankB) return rankA - rankB;
            const numA = parseInt((a.host_id || '').replace(/\D/g, ''), 10) || 999999;
            const numB = parseInt((b.host_id || '').replace(/\D/g, ''), 10) || 999999;
            return numA - numB;
        });
        setHosts(sortedHosts);
    }
  };

  // --- SMART AUTO-HK GENERATOR ---
  const generateNextHKNo = () => {
      let maxNum = 1000; // Starting point
      masterList.forEach(item => {
          if (item.hk_no && item.hk_no.startsWith('HK-')) {
              const numStr = item.hk_no.replace('HK-', '');
              const num = parseInt(numStr, 10);
              if (!isNaN(num) && num > maxNum) {
                  maxNum = num;
              }
          }
      });
      return `HK-${maxNum + 1}`;
  };

  // --- DUPLICATE CHECKER ---
  useEffect(() => {
      if (!isFormOpen || !currentItem.generic_name) {
          setDuplicateWarning(null);
          return;
      }
      
      const searchName = currentItem.generic_name.toLowerCase().trim();
      if (searchName.length < 3) {
          setDuplicateWarning(null);
          return;
      }

      // Find similar items, but exclude the one we are currently editing
      const possibleDupes = masterList.filter(m => {
          if (!m.generic_name) return false;
          if (isEditing && m.article_number === originalArticleNumber) return false; // Don't match against itself
          return m.generic_name.toLowerCase().includes(searchName) || searchName.includes(m.generic_name.toLowerCase());
      });

      if (possibleDupes.length > 0) {
          setDuplicateWarning(`Similar items found: ${possibleDupes.slice(0,2).map(d => d.generic_name).join(', ')}. Ensure this isn't a duplicate.`);
      } else {
          setDuplicateWarning(null);
      }
  }, [currentItem.generic_name, isFormOpen, isEditing, masterList, originalArticleNumber]);


  const handleEditItem = (item: MasterItem) => {
    setCurrentItem(item);
    setOriginalArticleNumber(item.article_number); // Store original in case they change it
    setIsEditing(true);
    setIsFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
  };

  const handleAddNew = () => {
    const newHK = generateNextHKNo();
    setCurrentItem({ 
        ...defaultItemState, 
        hk_no: newHK, 
        is_minibar_item: activeTab === 'Minibar Menu',
        category: activeTab === 'Minibar Menu' ? 'Soft Drinks' : (activeTab === 'Linen Catalog' ? 'Linen' : (activeTab === 'Bottle Catalog' ? 'Bottle' : 'Guest Amenities'))
    });
    setOriginalArticleNumber('');
    setIsEditing(false);
    setIsFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!event.target.files || event.target.files.length === 0) return;
      setIsUploading(true);
      const file = event.target.files[0];
      const fileName = `${Date.now()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage.from('item-images').upload(fileName, file);
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('item-images').getPublicUrl(fileName);
      setCurrentItem({ ...currentItem, image_url: data.publicUrl });
    } catch (error: any) {
      toast.error('Upload Error: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveItem = async () => {
    // ONLY require Generic Name now
    if (!currentItem.generic_name && !currentItem.article_name) return toast.error("Please provide a Name for the item.");

    // Generate HK number if missing
    const generatedHk = currentItem.hk_no || generateNextHKNo();
    
    // Auto-fill missing data so the database doesn't complain
    const finalArticleNumber = currentItem.article_number || generatedHk; 
    const finalGeneric = currentItem.generic_name || currentItem.article_name;
    const finalArticle = currentItem.article_name || finalGeneric;

    // Check if they are trying to use an existing Article Number for a NEW item, OR if they changed an existing item's ID to clash with another
    if (!isEditing || (isEditing && finalArticleNumber !== originalArticleNumber)) {
        const exactMatch = masterList.find(m => m.article_number.trim() === finalArticleNumber.trim());
        if (exactMatch) {
            return toast.error(`Cannot save! Article Number ${finalArticleNumber} is already used by "${exactMatch.generic_name || exactMatch.article_name}".`);
        }
    }
    
    setIsUploading(true);
    
    const { id, created_at, ...cleanData } = currentItem as any;

    const finalData = {
      ...cleanData,
      article_number: finalArticleNumber,
      generic_name: finalGeneric,
      article_name: finalArticle,
      micros_name: currentItem.is_minibar_item && !currentItem.micros_name ? finalArticle : currentItem.micros_name,
      hk_no: generatedHk,
      sub_category: currentItem.sub_category || ''
    };

    if (isEditing) {
        // If they changed the article number, we must delete the old one and insert the new one
        if (finalArticleNumber !== originalArticleNumber) {
            const { error: delError } = await supabase.from('hsk_master_catalog').delete().eq('article_number', originalArticleNumber);
            if (delError) {
                toast.error("Failed to update ID: " + delError.message);
                setIsUploading(false);
                return;
            }
            const { error: insError } = await supabase.from('hsk_master_catalog').insert(finalData);
            if (insError) toast.error("Error creating new ID: " + insError.message);
            else {
                setIsFormOpen(false); setIsEditing(false); setCurrentItem(defaultItemState); 
                fetchMasterList(); toast.success("Item ID and details updated!"); 
            }
        } else {
            // Normal update
            const { error } = await supabase.from('hsk_master_catalog').update(finalData).eq('article_number', originalArticleNumber);
            if (error) { toast.error("Error updating: " + error.message); } 
            else { 
                setIsFormOpen(false); setIsEditing(false); setCurrentItem(defaultItemState); 
                fetchMasterList(); toast.success("Item updated successfully!"); 
            }
        }
    } else {
        const { error } = await supabase.from('hsk_master_catalog').insert(finalData);
        if (error) { toast.error("Error adding: " + error.message); } 
        else { 
            setIsFormOpen(false); setIsEditing(false); setCurrentItem(defaultItemState); 
            fetchMasterList(); toast.success("Item added successfully!"); 
        }
    }
    setIsUploading(false);
  };

  const handleDeleteItem = async (id: string) => {
    if(!confirm("Delete this item permanently?")) return;
    await supabase.from('hsk_master_catalog').delete().eq('article_number', id);
    fetchMasterList();
    toast.success("Item deleted.");
  };

  // --- ITEM MERGE LOGIC ---
  const handleConfirmMerge = async () => {
      if (!mergeModalItem || !mergeTargetId) return toast.error("Select an item to merge into.");
      if (mergeModalItem.article_number === mergeTargetId) return toast.error("Cannot merge into itself.");
      
      const targetItem = masterList.find(i => i.article_number === mergeTargetId);
      if (!targetItem) return toast.error("Target item not found.");

      if (!confirm(`Are you sure you want to merge ALL history from ${mergeModalItem.article_name} into ${targetItem.article_name}? This will delete the old item.`)) return;

      setIsMerging(true);
      toast.loading("Merging items...", { id: 'merge-toast' });

      try {
          await supabase.from('hsk_monthly_stock').update({ article_number: mergeTargetId }).eq('article_number', mergeModalItem.article_number);
          await supabase.from('hsk_expiry_batches').update({ article_number: mergeTargetId }).eq('article_number', mergeModalItem.article_number);
          
          const newLegacyIds = targetItem.legacy_ids ? `${targetItem.legacy_ids}, ${mergeModalItem.article_number}` : mergeModalItem.article_number;
          await supabase.from('hsk_master_catalog').update({ legacy_ids: newLegacyIds }).eq('article_number', mergeTargetId);
          await supabase.from('hsk_master_catalog').delete().eq('article_number', mergeModalItem.article_number);

          toast.success("Items successfully merged!", { id: 'merge-toast' });
          setMergeModalItem(null);
          setMergeTargetId('');
          fetchMasterList();

      } catch (err: any) {
          toast.error("Merge failed: " + err.message, { id: 'merge-toast' });
      } finally {
          setIsMerging(false);
      }
  };

  // --- CSV UPLOAD/DOWNLOAD LOGIC ---
  const parseCSVLine = (text: string) => {
      let ret = []; let inQuote = false; let value = '';
      for (let i = 0; i < text.length; i++) {
          let ch = text[i];
          if (inQuote) {
              if (ch === '"') { if (i + 1 < text.length && text[i + 1] === '"') { value += '"'; i++; } else { inQuote = false; } } else { value += ch; }
          } else {
              if (ch === '"') { inQuote = true; } else if (ch === ',') { ret.push(value.trim()); value = ''; } else { value += ch; }
          }
      }
      ret.push(value.trim());
      return ret;
  };

  const downloadCSVFormat = () => {
      const csvContent = "hk_no,article_number,article_name,generic_name,category,unit,inventory_type\n" +
                         "HK-1001,3101017,Body Lotion (Lemongrass),Body Lotion - Lemongrass,Guest Amenities,Each,Asset Inventory\n" +
                         "HK-1002,1002,Example Towel,Bath Towel,Linen,Each,Linen Inventory";
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = window.URL.createObjectURL(blob);
      a.download = "MasterCatalog_Upload_Format.csv";
      a.click();
      toast.success("Format Downloaded!");
  };

  const handleCSVUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (e) => {
          try {
              const text = e.target?.result as string;
              const rows = text.split(/\r?\n/).filter(row => row.trim().length > 0);
              
              if(rows.length < 2) throw new Error("CSV is empty or missing data.");

              const headers = parseCSVLine(rows[0]).map(h => h.toLowerCase().trim());
              const idIdx = headers.indexOf('article_number');
              const nameIdx = headers.indexOf('article_name');
              
              if (idIdx === -1 || nameIdx === -1) throw new Error("CSV must contain 'article_number' and 'article_name' columns.");

              const genNameIdx = headers.indexOf('generic_name');
              const hkIdx = headers.indexOf('hk_no');
              const catIdx = headers.indexOf('category');
              const unitIdx = headers.indexOf('unit');
              const invTypeIdx = headers.indexOf('inventory_type');

              const itemsMap = new Map();

              for (let i = 1; i < rows.length; i++) {
                  const cols = parseCSVLine(rows[i]);
                  if (!cols[idIdx]) continue; 
                  
                  const articleNum = String(cols[idIdx]).trim();
                  if (!articleNum) continue;

                  let categoryValue = catIdx !== -1 && cols[catIdx] ? cols[catIdx] : 'General Requests';

                  itemsMap.set(articleNum, {
                      article_number: articleNum,
                      hk_no: hkIdx !== -1 && cols[hkIdx] ? cols[hkIdx] : generateNextHKNo(), 
                      article_name: cols[nameIdx] || 'Unnamed Item',
                      generic_name: genNameIdx !== -1 && cols[genNameIdx] ? cols[genNameIdx] : (cols[nameIdx] || 'Unnamed Item'),
                      category: categoryValue,
                      unit: unitIdx !== -1 && cols[unitIdx] ? cols[unitIdx] : 'Each',
                      inventory_type: invTypeIdx !== -1 && cols[invTypeIdx] ? cols[invTypeIdx] : null,
                      is_minibar_item: MINIBAR_CATEGORIES.includes(categoryValue)
                  });
              }

              const finalItemsToInsert = Array.from(itemsMap.values());
              if (finalItemsToInsert.length === 0) throw new Error("No valid rows found to import after parsing.");

              setCsvPreviewData(finalItemsToInsert);

          } catch (error: any) {
              toast.error(`Parse Error: ${error.message}`);
          } finally {
              if(csvInputRef.current) csvInputRef.current.value = ''; 
          }
      };
      reader.readAsText(file);
  };

  const confirmCSVImport = async () => {
      if (!csvPreviewData) return;
      setIsUploading(true);
      toast.loading("Saving to database...", { id: 'csv-upload' });

      try {
          const { error } = await supabase.from('hsk_master_catalog').upsert(csvPreviewData, { onConflict: 'article_number' });
          if (error) throw error;

          toast.success(`Successfully imported ${csvPreviewData.length} items!`, { id: 'csv-upload' });
          fetchMasterList();
          setCsvPreviewData(null);
      } catch (error: any) {
          toast.error(`Import Error: ${error.message}`, { id: 'csv-upload' });
      } finally {
          setIsUploading(false);
      }
  };

  const handlePrintQR = () => {
      if (!qrModalItem) return;
      
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;

      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrModalItem.hk_no || qrModalItem.article_number)}`;

      printWindow.document.write(`
          <html>
          <head>
              <title>Print Label - ${qrModalItem.hk_no}</title>
              <style>
                  body { font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #fff; }
                  .label { border: 2px solid #000; padding: 20px; text-align: center; width: 250px; border-radius: 12px; }
                  .qr { width: 150px; height: 150px; margin-bottom: 10px; }
                  .hk { font-size: 24px; font-weight: 900; margin: 0; }
                  .name { font-size: 14px; margin: 5px 0 0 0; color: #333; font-weight: bold; }
                  .article { font-size: 10px; margin: 5px 0 0 0; color: #666; font-family: monospace;}
              </style>
          </head>
          <body>
              <div class="label">
                  <img src="${qrUrl}" class="qr"/>
                  <h1 class="hk">${qrModalItem.hk_no || 'NO-HK'}</h1>
                  <p class="name">${qrModalItem.generic_name || qrModalItem.article_name}</p>
                  <p class="article">Art No: ${qrModalItem.article_number}</p>
              </div>
              <script>
                  window.onload = function() { setTimeout(() => { window.print(); window.close(); }, 500); }
              </script>
          </body>
          </html>
      `);
      printWindow.document.close();
  };


  // --- MISC SETTINGS FUNCTIONS ---
  const handleAddConstant = async (type: string) => {
    if (!newConstantValue.trim()) return;
    const { error } = await supabase.from('hsk_constants').insert({ type, label: newConstantValue });
    if (!error) { setNewConstantValue(''); fetchConstants(); }
  };

  const handleAddHoliday = async () => {
    if (!holidayName.trim() || !holidayDate) return toast.error("Please enter both the date and the name of the holiday.");
    const label = `${holidayDate}::${holidayName.trim()}`;
    const { error } = await supabase.from('hsk_constants').insert({ type: 'public_holiday', label });
    if (!error) { setHolidayName(''); setHolidayDate(''); fetchConstants(); toast.success("Public Holiday Added!"); }
  };

  const handleAddGem = async () => {
    if (!gemName.trim() || !gemMvpn.trim()) return toast.error("Please enter both Name and MVPN");
    const label = `${gemName.trim()} - ${gemMvpn.trim()}`;
    const { error } = await supabase.from('hsk_constants').insert({ type: 'gem', label });
    if (!error) { setGemName(''); setGemMvpn(''); fetchConstants(); }
  };

  const handleDeleteConstant = async (id: string) => {
    if (!confirm('Remove?')) return;
    await supabase.from('hsk_constants').delete().eq('id', id);
    fetchConstants();
  };

  const handleSaveSystemConfig = async (type: string, val: string) => {
    setIsUploading(true);
    await supabase.from('hsk_constants').delete().eq('type', type);
    await supabase.from('hsk_constants').insert({ type, label: val });
    if(type === 'system_timezone') localStorage.setItem('hk_pulse_timezone', val);
    setIsUploading(false);
    toast.success('System config updated successfully!');
  };

  const updateHostRole = async (id: string, newRole: string) => {
      await supabase.from('hsk_hosts').update({ system_role: newRole }).eq('id', id);
      setHosts(hosts.map(h => h.id === id ? { ...h, system_role: newRole } : h));
      toast.success("Role updated successfully!");
  };

  const resetHostPin = async (id: string, name: string) => {
      if(!confirm(`Reset PIN for ${name} to '0000'? They will be forced to change it on next login.`)) return;
      await supabase.from('hsk_hosts').update({ pin: '0000', requires_pin_change: true }).eq('id', id);
      setHosts(hosts.map(h => h.id === id ? { ...h, pin: '0000', requires_pin_change: true } : h));
      toast.success(`PIN reset to 0000 for ${name}`);
  };

  const viewHostLogs = async (host: Host) => {
      setSelectedLogHost(host);
      setHostLogs([]);
      setIsLoadingLogs(true);
      const { data } = await supabase.from('hsk_daily_requests')
          .select('*')
          .ilike('attendant_name', `%${host.full_name.split(' ')[0]}%`)
          .order('request_time', { ascending: false })
          .limit(50);
      setHostLogs(data || []);
      setIsLoadingLogs(false);
  };

  const saveTeamConfig = async (access: Record<string, string[]> = supervisorAccess) => {
      setIsUploading(true);
      try {
          let currentConfig: any = {};
          if (configId) {
              const { data } = await supabase.from('hsk_constants').select('label').eq('id', configId).single();
              if (data && data.label) { try { currentConfig = JSON.parse(data.label); } catch(e){} }
          }
          currentConfig.supervisorAccess = access;
          const payload = JSON.stringify(currentConfig);
          
          if (configId) {
              const { error } = await supabase.from('hsk_constants').update({ label: payload }).eq('id', configId);
              if (error) throw error;
          } else {
              const { data, error } = await supabase.from('hsk_constants').insert({ type: 'team_viewer_config', label: payload }).select().single();
              if (error) throw error;
              if (data) setConfigId(data.id);
          }
          toast.success("Team view saved");
      } catch (err: any) {
          toast.error("Failed to save: " + err.message);
      } finally {
          setIsUploading(false);
      }
  };

  const handleOpenExpiryBatches = async (item: MasterItem) => {
      setSelectedExpiryItem(item);
      setIsLoadingBatches(true);
      const { data } = await supabase.from('hsk_expiry_batches').select('*').eq('article_number', item.article_number).neq('status', 'Archived').order('expiry_date', { ascending: true });
      setItemBatches(data || []);
      setIsLoadingBatches(false);
  };

  const handleAddBatchDate = async () => {
      if (!newBatchDate || !selectedExpiryItem) return;
      if (itemBatches.find(b => b.expiry_date === newBatchDate)) return toast.error('Batch date already exists!');
      const { error } = await supabase.from('hsk_expiry_batches').insert({ article_number: selectedExpiryItem.article_number, expiry_date: newBatchDate, status: 'Active' });
      if (!error) { setNewBatchDate(''); toast.success('Batch added!'); handleOpenExpiryBatches(selectedExpiryItem); }
      else toast.error('Failed to add batch');
  };

  const handleArchiveBatch = async (batchId: string) => {
      if (!confirm('Are you sure?')) return;
      const { error } = await supabase.from('hsk_expiry_batches').update({ status: 'Archived' }).eq('id', batchId);
      if (!error) { toast.success('Removed!'); if (selectedExpiryItem) handleOpenExpiryBatches(selectedExpiryItem); }
      else toast.error('Failed to remove batch');
  };

  const filteredList = masterList.filter(item => 
    (item.article_name||'').toLowerCase().includes(searchQuery.toLowerCase()) || 
    (item.generic_name||'').toLowerCase().includes(searchQuery.toLowerCase()) || 
    (item.hk_no||'').toLowerCase().includes(searchQuery.toLowerCase()) || 
    item.article_number.includes(searchQuery)
  ).filter(item => {
    if (activeTab === 'Minibar Menu') return item.is_minibar_item;
    if (activeTab === 'Linen Catalog') return item.category === 'Linen';
    if (activeTab === 'Bottle Catalog') return item.category === 'Bottle';
    if (activeTab === 'Master List') return !item.is_minibar_item && item.category !== 'Linen' && item.category !== 'Bottle';
    if (activeTab === 'Expiry Setup') return item.has_expiry;
    return true;
  });

  const availableCategories = currentItem.is_minibar_item 
      ? MINIBAR_CATEGORIES 
      : constants.filter(c => c.type === 'category').map(c => c.label);

  const handleExportCSV = () => {
      const headers = ["#", "HK_no", "Name of item", "Category", "Sub category"];
      const rows = filteredList.map((item, index) => {
          const escapeCSV = (str: string) => `"${(str || '').toString().replace(/"/g, '""')}"`;
          return [
              index + 1,
              escapeCSV(item.hk_no || ''),
              escapeCSV(item.generic_name || item.article_name || ''),
              escapeCSV(item.category || ''),
              escapeCSV(item.sub_category || '')
          ].join(',');
      });

      const csvContent = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `${activeTab.replace(/\s+/g, '_')}_List.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(`${activeTab} exported as CSV!`);
  };

  // --- LOGINS & ACCESS (active hosts only) ---
  const activeHosts = hosts.filter(h => h.status !== 'Resigned');
  const activeIds = new Set(activeHosts.map(h => h.host_id));
  const teamCount = (h: Host) => (supervisorAccess[h.host_id] || []).filter(id => activeIds.has(id)).length;
  const accessCounts = {
    all: activeHosts.length,
    admin: activeHosts.filter(h => h.system_role === 'admin').length,
    team: activeHosts.filter(h => h.system_role !== 'admin' && teamCount(h) > 0).length,
    pin: activeHosts.filter(h => h.requires_pin_change).length,
  };
  const accessList = activeHosts
    .filter(h => accessFilter === 'all' || (accessFilter === 'admin' ? h.system_role === 'admin' : accessFilter === 'team' ? h.system_role !== 'admin' && teamCount(h) > 0 : !!h.requires_pin_change))
    .filter(h => { const q = hostSearch.toLowerCase().trim(); return !q || h.full_name.toLowerCase().includes(q) || h.host_id.toLowerCase().includes(q) || (h.role || '').toLowerCase().includes(q); })
    .sort((a, b) => (a.system_role === 'admin' ? 0 : 1) - (b.system_role === 'admin' ? 0 : 1));

  const closeAccessModal = async () => {
      if (!accessModalHost) return;
      // Drop people who have since resigned, then save straight away.
      const cleaned = { ...supervisorAccess, [accessModalHost.host_id]: (supervisorAccess[accessModalHost.host_id] || []).filter(id => activeIds.has(id)) };
      if (!cleaned[accessModalHost.host_id].length) delete cleaned[accessModalHost.host_id];
      setSupervisorAccess(cleaned);
      setAccessModalHost(null);
      await saveTeamConfig(cleaned);
  };

  const section = ALL_SECTIONS.find(x => x.key === activeTab)!;
  const isCatalog = SECTIONS[0].items.some(x => x.key === activeTab);
  const inputCls = 'px-3 py-2.5 border border-slate-200 rounded-xl font-semibold text-sm bg-slate-50 outline-none focus:border-[#6D2158] focus:bg-white';

  return (
    <div className="h-[calc(100dvh-4rem-env(safe-area-inset-bottom))] md:h-[100dvh] w-full overflow-hidden flex flex-col md:flex-row bg-[#FDFBFD] font-antiqua text-[#6D2158]">

      {/* SETTINGS MENU — side column on desktop, scrolling strip on phones */}
      <aside className="md:w-60 lg:w-64 shrink-0 border-b md:border-b-0 md:border-r border-slate-200 bg-white md:overflow-y-auto">
        <div className="px-4 pt-4 pb-2 md:px-5 md:pt-6 md:pb-4">
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">Settings</h1>
          <p className="hidden md:block text-[11px] text-slate-400 mt-0.5">Configuration & master data</p>
        </div>
        <nav className="flex md:flex-col gap-1 overflow-x-auto no-scrollbar px-3 pb-3 md:px-3 md:pb-6">
          {SECTIONS.map(g => (
            <div key={g.group} className="flex md:flex-col gap-1 md:mb-3 shrink-0">
              <div className="hidden md:block px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{g.group}</div>
              {g.items.map(item => {
                const Icon = item.icon;
                const on = activeTab === item.key;
                return (
                  <button key={item.key} onClick={() => { setActiveTab(item.key); setIsFormOpen(false); setSearchQuery(''); }}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors ${on ? 'bg-[#6D2158] text-white md:bg-[#6D2158]/10 md:text-[#6D2158]' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 bg-slate-50 md:bg-transparent'}`}>
                    <Icon size={16} className="shrink-0"/> {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      {/* CONTENT */}
      <main className="flex-1 min-w-0 overflow-y-auto custom-scrollbar">
        <div className={`${isCatalog ? 'max-w-7xl' : 'max-w-4xl'} mx-auto px-4 md:px-8 py-5 md:py-8 pb-24 space-y-5`}>
          <header>
            <h2 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2">{section.label}</h2>
            <p className="text-sm text-slate-500 mt-1">{section.desc}</p>
          </header>

          {activeTab === 'Access Control' ? (
              <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto no-scrollbar">
                          {([['all', 'Everyone'], ['admin', 'Admins'], ['team', 'Sees team'], ['pin', 'PIN reset']] as const).map(([k, label]) => (
                              <button key={k} onClick={() => setAccessFilter(k)} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition ${accessFilter === k ? 'bg-white text-[#6D2158] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                  {label} <span className="opacity-60">{accessCounts[k]}</span>
                              </button>
                          ))}
                      </div>
                      <div className="relative sm:w-64">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                          <input type="text" placeholder="Search name, SSL, designation" className={`${inputCls} w-full pl-9`} value={hostSearch} onChange={e => setHostSearch(e.target.value)} />
                      </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm divide-y divide-slate-100">
                      {accessList.length === 0 && <p className="p-8 text-center text-sm text-slate-400 italic">No one matches.</p>}
                      {accessList.map(host => {
                          const isAdmin = host.system_role === 'admin';
                          const n = teamCount(host);
                          return (
                              <div key={host.id} className="flex flex-col md:flex-row md:items-center gap-3 p-3 md:px-4">
                                  <div className="flex items-center gap-3 flex-1 min-w-0">
                                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isAdmin ? 'bg-[#6D2158] text-white' : 'bg-slate-100 text-slate-500'}`}>
                                          {host.full_name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                                      </div>
                                      <div className="min-w-0">
                                          <div className="font-bold text-slate-800 text-sm truncate">{host.full_name}</div>
                                          <div className="text-[11px] text-slate-400 truncate">{host.host_id} · {host.role}</div>
                                      </div>
                                  </div>
                                  <div className="flex items-center gap-2 flex-wrap md:flex-nowrap pl-12 md:pl-0">
                                      <div className="flex bg-slate-100 p-0.5 rounded-lg" title="System role">
                                          {(['staff', 'admin'] as const).map(r => (
                                              <button key={r} onClick={() => (host.system_role || 'staff') !== r && updateHostRole(host.id, r)}
                                                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold capitalize transition ${(host.system_role || 'staff') === r ? (r === 'admin' ? 'bg-[#6D2158] text-white shadow-sm' : 'bg-white text-slate-700 shadow-sm') : 'text-slate-400'}`}>{r}</button>
                                          ))}
                                      </div>
                                      {isAdmin ? (
                                          <span className="w-32 text-center px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">Sees everyone</span>
                                      ) : (
                                          <button onClick={() => { setAccessSearchQuery(''); setAccessModalHost(host); }}
                                              className={`w-32 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition ${n ? 'bg-[#6D2158]/5 text-[#6D2158] border-[#6D2158]/20 hover:bg-[#6D2158]/10' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                                              <Eye size={13}/> {n ? `Sees ${n} host${n === 1 ? '' : 's'}` : 'Own tasks only'}
                                          </button>
                                      )}
                                      <button onClick={() => resetHostPin(host.id, host.full_name)} title="Reset PIN to 0000"
                                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition ${host.requires_pin_change ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-white text-slate-500 border-slate-200 hover:text-amber-700 hover:border-amber-200'}`}>
                                          <KeyRound size={13}/> {host.requires_pin_change ? 'Reset pending' : 'Reset PIN'}
                                      </button>
                                      <button onClick={() => viewHostLogs(host)} className="p-1.5 rounded-lg text-slate-400 border border-slate-200 hover:text-[#6D2158] hover:border-[#6D2158]/30" title="Recent activity"><History size={15}/></button>
                                  </div>
                              </div>
                          );
                      })}
                  </div>
              </div>
          ) : activeTab === 'General' ? (
            <div className="space-y-5">
               <SettingsCard icon={Clock} title="Timezone" description="Used for times and dates across the whole app.">
                  <div className="flex flex-col sm:flex-row gap-2">
                      <select className={`${inputCls} flex-1`} value={systemTimezone} onChange={e => setSystemTimezone(e.target.value)}>
                          <option value="Indian/Maldives">Maldives Time (GMT+5)</option>
                          <option value="Asia/Dhaka">Bangladesh Time (GMT+6)</option>
                          <option value="Asia/Colombo">Sri Lanka Time (GMT+5:30)</option>
                          <option value="UTC">Universal Time (UTC)</option>
                      </select>
                      <button onClick={() => handleSaveSystemConfig('system_timezone', systemTimezone)} className="px-5 py-2.5 bg-[#6D2158] text-white rounded-xl font-bold text-xs uppercase hover:bg-[#5a1b49] flex items-center justify-center gap-1.5"><Save size={14}/> Save</button>
                  </div>
               </SettingsCard>

               <SettingsCard icon={Plane} title="Public holidays" description="Counted as PH on attendance and leave balances.">
                  <div className="flex flex-col sm:flex-row gap-2 mb-3">
                     <input type="date" className={inputCls} value={holidayDate} onChange={e=>setHolidayDate(e.target.value)} />
                     <input type="text" placeholder="Holiday name" className={`${inputCls} flex-1`} value={holidayName} onChange={e=>setHolidayName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAddHoliday(); }} />
                     <button onClick={handleAddHoliday} className="px-5 py-2.5 bg-[#6D2158] text-white rounded-xl font-bold uppercase text-xs hover:bg-[#5a1b49] flex items-center justify-center gap-1"><Plus size={14}/> Add</button>
                  </div>
                  <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl max-h-80 overflow-y-auto">
                     {constants.filter(c => c.type === 'public_holiday').length === 0 && <p className="p-4 text-xs text-slate-400 italic">No holidays added.</p>}
                     {constants.filter(c => c.type === 'public_holiday')
                        .map(item => { const [d, n] = item.label.split('::'); return { item, d, n }; })
                        .sort((x, y) => (y.d || '').localeCompare(x.d || ''))
                        .map(({ item, d, n }) => {
                        let pretty = d;
                        try { pretty = format(parseISO(d), 'EEE d MMM yyyy'); } catch { /* keep raw */ }
                        return (
                         <div key={item.id} className="flex items-center gap-3 px-3 py-2">
                            <span className="w-32 shrink-0 text-xs font-bold text-[#6D2158]">{pretty}</span>
                            <span className="flex-1 text-sm font-semibold text-slate-700 truncate">{n}</span>
                            <button onClick={() => handleDeleteConstant(item.id)} className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50"><Trash2 size={14}/></button>
                         </div>
                        )
                     })}
                  </div>
               </SettingsCard>
            </div>
          ) : activeTab === 'Lists' ? (
            <div className="space-y-5">
               <DesignationOrder constants={constants} hosts={hosts} fetchConstants={fetchConstants} handleDeleteConstant={handleDeleteConstant} />
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                 <ListManager type="sub_department" title="Sub-departments" description="Teams a host can belong to (Hosts page)." icon={Building} placeholder="e.g. Water Room" constants={constants} newConstantValue={newConstantValue} activeConstantType={activeConstantType} setActiveConstantType={setActiveConstantType} setNewConstantValue={setNewConstantValue} handleAddConstant={handleAddConstant} handleDeleteConstant={handleDeleteConstant} />
                 <ListManager type="category" title="Item categories" description="Categories for catalog items." icon={Layers} placeholder="e.g. Bottle" constants={constants} newConstantValue={newConstantValue} activeConstantType={activeConstantType} setActiveConstantType={setActiveConstantType} setNewConstantValue={setNewConstantValue} handleAddConstant={handleAddConstant} handleDeleteConstant={handleDeleteConstant} />
                 <ListManager type="requester" title="Requested-by names" description="Extra names offered in the “requested by” field on requests." icon={Users} placeholder="Add a name" constants={constants} newConstantValue={newConstantValue} activeConstantType={activeConstantType} setActiveConstantType={setActiveConstantType} setNewConstantValue={setNewConstantValue} handleAddConstant={handleAddConstant} handleDeleteConstant={handleDeleteConstant} />
               </div>
            </div>
          ) : activeTab === 'GEM Directory' ? (
               <SettingsCard icon={Star} title="GEMs" description="Name and MVPN.">
                  <div className="flex flex-col sm:flex-row gap-2 mb-3">
                    <input type="text" placeholder="GEM name" className={`${inputCls} flex-1`} value={gemName} onChange={(e) => setGemName(e.target.value)}/>
                    <input type="number" inputMode="numeric" placeholder="MVPN" className={`${inputCls} sm:w-36`} value={gemMvpn} onChange={(e) => setGemMvpn(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAddGem(); }}/>
                    <button onClick={handleAddGem} className="px-5 py-2.5 bg-[#6D2158] text-white rounded-xl font-bold uppercase text-xs hover:bg-[#5a1b49] flex items-center justify-center gap-1"><Plus size={14}/> Add</button>
                  </div>
                  <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl">
                     {constants.filter(c => c.type === 'gem').length === 0 && <p className="p-4 text-xs text-slate-400 italic">No GEMs added.</p>}
                     {constants.filter(c => c.type === 'gem').map(item => (
                       <div key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                          <User size={15} className="text-slate-300"/>
                          <span className="flex-1 text-sm font-semibold text-slate-700">{item.label}</span>
                          <button onClick={() => handleDeleteConstant(item.id)} className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50"><Trash2 size={14}/></button>
                       </div>
                     ))}
                  </div>
               </SettingsCard>
          ) : (
            <div className="animate-in slide-in-from-right-4 duration-300">
               
               <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-3 mb-5">
                  <div className="relative w-full lg:max-w-md">
                     <Search className="absolute left-3 top-3 text-slate-400" size={18}/>
                     <input type="text" placeholder={`Search ${activeTab}...`} className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-[#6D2158]" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}/>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                     
                     {/* EXPORT LIST BUTTON */}
                     {['Master List', 'Minibar Menu', 'Linen Catalog', 'Bottle Catalog'].includes(activeTab) && !isFormOpen && (
                         <button onClick={handleExportCSV} className="bg-slate-100 text-slate-600 px-4 py-3 rounded-xl text-xs font-bold uppercase flex items-center justify-center gap-2 shadow-sm border border-slate-200 transition-all hover:bg-slate-200" title="Export Current List to CSV">
                             <FileSpreadsheet size={16}/> Export CSV
                         </button>
                     )}

                     {/* CSV BULK UPLOAD BUTTONS */}
                     {activeTab === 'Master List' && !isFormOpen && (
                         <div className="flex items-center bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                             <button onClick={downloadCSVFormat} className="px-4 py-3 text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-widest border-r border-slate-200" title="Download CSV Template">
                                 <Download size={16}/> Format
                             </button>
                             <label className="px-4 py-3 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-widest cursor-pointer" title="Upload Filled CSV">
                                 {isUploading ? <Loader2 size={16} className="animate-spin"/> : <FileSpreadsheet size={16}/>}
                                 Upload
                                 <input type="file" ref={csvInputRef} accept=".csv" className="hidden" onChange={handleCSVUpload}/>
                             </label>
                         </div>
                     )}

                     <button onClick={() => isFormOpen ? setIsFormOpen(false) : handleAddNew()} className="bg-[#6D2158] text-white px-5 py-3 rounded-xl text-xs font-bold uppercase flex items-center justify-center gap-2 shadow-lg whitespace-nowrap transition-all hover:bg-[#5a1b49]">
                         {isFormOpen ? <X size={18}/> : <Plus size={18}/>}
                         {isFormOpen ? 'Close Form' : 'Add Item'}
                     </button>
                  </div>
               </div>

               {isFormOpen && (
                  <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-100 mb-8 animate-in slide-in-from-top-4">
                     <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-700">{isEditing ? <Edit3 size={20}/> : <Plus size={20}/>}{isEditing ? `Edit: ${currentItem.generic_name || currentItem.article_name}` : `New Entry`}</h3>
                     <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                        <div className="md:col-span-3 space-y-4">
                            <div onClick={() => fileInputRef.current?.click()} className={`w-full h-40 bg-slate-50 border-2 border-dashed ${isUploading ? 'border-[#6D2158]' : 'border-slate-200'} rounded-xl flex flex-col items-center justify-center text-slate-400 overflow-hidden relative cursor-pointer hover:border-[#6D2158] transition-all`}>
                                {isUploading ? <Loader2 className="animate-spin text-[#6D2158]" size={32}/> : currentItem.image_url ? <img src={currentItem.image_url} className="w-full h-full object-cover"/> : <><UploadCloud size={32} className="mb-2"/><span className="text-[10px] font-bold uppercase">Upload Image</span></>}
                            </div>
                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload}/>
                        </div>
                        <div className="md:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-4">
                            
                            <div className="col-span-2 p-3 bg-indigo-50 border border-indigo-100 rounded-xl mb-2 flex items-center gap-4">
                                <div className="flex-1">
                                    <label className="text-[10px] font-black text-indigo-500 uppercase ml-1 flex items-center gap-1"><Zap size={12}/> Unique HK Number</label>
                                    <input disabled={true} className="w-full p-2 bg-transparent font-mono font-black text-indigo-800 text-lg outline-none" value={currentItem.hk_no || ''} />
                                </div>
                                <button onClick={() => setCurrentItem({...currentItem, hk_no: generateNextHKNo()})} className="px-4 py-2 bg-white text-indigo-600 rounded-lg text-[10px] font-bold uppercase shadow-sm border border-indigo-100 hover:bg-indigo-600 hover:text-white transition-colors">
                                    Generate New
                                </button>
                            </div>

                            <div className="md:col-span-2">
                               <label className="text-[10px] font-black text-[#6D2158] uppercase ml-1">Generic Name (Display Name)</label>
                               <input className="w-full p-3 bg-white border-2 border-[#6D2158]/20 rounded-xl font-black text-slate-800 outline-none focus:border-[#6D2158]" value={currentItem.generic_name || ''} onChange={e => setCurrentItem({...currentItem, generic_name: e.target.value})} placeholder="e.g. Lemongrass Lotion" />
                               
                               {/* CHANGED: Warning now just shows a message, doesn't disable save */}
                               {duplicateWarning && (
                                   <p className="text-[10px] font-bold text-amber-600 bg-amber-50 p-2 rounded-lg mt-2 flex items-center gap-1 animate-in fade-in"><AlertTriangle size={12}/> {duplicateWarning}</p>
                               )}
                            </div>

                            <div>
                               <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Official Article Name (Optional)</label>
                               <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:border-[#6D2158]" value={currentItem.article_name || ''} onChange={e => setCurrentItem({...currentItem, article_name: e.target.value})} placeholder="e.g. Body Lotion 50ml Dispenser" />
                            </div>
                            <div>
                               <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Official Article Number {isEditing && <span className="text-amber-500 lowercase">(Change with caution)</span>}</label>
                               {/* CHANGED: Removed disabled={isEditing} */}
                               <input className="w-full p-3 border rounded-xl font-bold text-slate-700 outline-none focus:border-[#6D2158] bg-slate-50" value={currentItem.article_number || ''} onChange={e => setCurrentItem({...currentItem, article_number: e.target.value})} placeholder="Leave blank to auto-fill with HK No."/>
                            </div>
                            
                            
                            <div>
                               <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Category</label>
                               <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none" value={currentItem.category || ''} onChange={e => setCurrentItem({...currentItem, category: e.target.value})}>
                                   {availableCategories.map((c: any) => <option key={c}>{c}</option>)}
                               </select>
                            </div>
                            <div>
                               <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Sub Category (Optional)</label>
                               <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:border-[#6D2158]" value={currentItem.sub_category || ''} onChange={e => setCurrentItem({...currentItem, sub_category: e.target.value})} placeholder="e.g. Pillows, Towels" />
                            </div>
                            <div>
                               <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Unit</label>
                               <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none" value={currentItem.unit || 'Each'} onChange={e => setCurrentItem({...currentItem, unit: e.target.value})}><option>Each</option><option>Kg</option><option>Ltr</option><option>Box</option></select>
                            </div>
                            
                            {/* INVENTORY LINKER INSIDE SETTINGS */}
                            <div className="md:col-span-2">
                                <label className="text-[10px] font-black text-indigo-500 uppercase ml-1 flex items-center gap-1"><Layers size={12}/> Link to Live Inventory</label>
                                <select className="w-full p-3 bg-indigo-50 border border-indigo-100 rounded-xl font-bold text-indigo-700 outline-none focus:border-indigo-400 mt-1" value={currentItem.inventory_type || ''} onChange={e => setCurrentItem({...currentItem, inventory_type: e.target.value})}>
                                    <option value="">-- Do Not Link --</option>
                                    {constants.filter(c => c.type === 'inv_type').map(t => <option key={t.id} value={t.label}>{t.label}</option>)}
                                </select>
                                <p className="text-[9px] text-slate-400 mt-1 ml-1">If selected, this item will automatically appear in staff counting tasks for this inventory type.</p>
                            </div>

                            <div className="md:col-span-2 flex flex-col sm:flex-row gap-4 sm:gap-6 pt-4 border-t border-slate-100 mt-2">
                               <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${currentItem.is_minibar_item ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'}`} onClick={() => setCurrentItem({...currentItem, is_minibar_item: !currentItem.is_minibar_item})}><div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${currentItem.is_minibar_item ? 'bg-rose-500 border-rose-500' : 'border-slate-300'}`}>{currentItem.is_minibar_item && <CheckCircle size={14} className="text-white"/>}</div><span className="text-sm font-bold uppercase">Minibar Item</span></div>
                               <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${currentItem.has_expiry ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`} onClick={() => setCurrentItem({...currentItem, has_expiry: !currentItem.has_expiry})}><div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${currentItem.has_expiry ? 'bg-amber-500 border-amber-500' : 'border-slate-300'}`}>{currentItem.has_expiry && <CheckCircle size={14} className="text-white"/>}</div><span className="text-sm font-bold uppercase">Expiry Tracking</span></div>
                            </div>
                            
                            {currentItem.is_minibar_item && (
                                <div className="md:col-span-2 p-4 bg-rose-50 rounded-xl border border-rose-100 grid grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in">
                                   <div><label className="text-[10px] font-bold text-rose-400 uppercase">Micros Name</label><input className="w-full p-3 bg-white border border-rose-200 rounded-xl font-bold text-slate-700 outline-none" value={currentItem.micros_name || ''} onChange={e => setCurrentItem({...currentItem, micros_name: e.target.value})} /></div>
                                   <div><label className="text-[10px] font-bold text-rose-400 uppercase">Sort Order</label><input type="number" className="w-full p-3 bg-white border border-rose-200 rounded-xl font-bold text-slate-700 outline-none" value={currentItem.sort_order ?? 0} onChange={e => setCurrentItem({...currentItem, sort_order: parseInt(e.target.value) || 0})} /></div>
                                   <div><label className="text-[10px] font-bold text-rose-400 uppercase">Avg Cost</label><input type="number" className="w-full p-3 bg-white border border-rose-200 rounded-xl font-bold text-slate-700 outline-none" value={currentItem.avg_cost ?? 0} onChange={e => setCurrentItem({...currentItem, avg_cost: parseFloat(e.target.value) || 0})} /></div>
                                   <div><label className="text-[10px] font-bold text-rose-400 uppercase">Sales Price</label><input type="number" className="w-full p-3 bg-white border border-rose-200 rounded-xl font-bold text-slate-700 outline-none" value={currentItem.sales_price ?? 0} onChange={e => setCurrentItem({...currentItem, sales_price: parseFloat(e.target.value) || 0})} /></div>
                                </div>
                            )}
                            {!currentItem.is_minibar_item && (
                                <div className="md:col-span-2 p-4 bg-blue-50 rounded-xl border border-blue-100 grid grid-cols-1 sm:grid-cols-3 gap-4 animate-in fade-in">
                                    <div><label className="text-[10px] font-bold text-blue-500 uppercase">Par Level</label><input type="number" className="w-full p-3 bg-white border border-blue-200 rounded-xl font-bold text-slate-700 outline-none" value={currentItem.par_level ?? 0} onChange={e => setCurrentItem({...currentItem, par_level: parseFloat(e.target.value) || 0})} /></div>
                                    <div><label className="text-[10px] font-bold text-blue-500 uppercase">Reorder Qty</label><input type="number" className="w-full p-3 bg-white border border-blue-200 rounded-xl font-bold text-slate-700 outline-none" value={currentItem.reorder_qty ?? 0} onChange={e => setCurrentItem({...currentItem, reorder_qty: parseFloat(e.target.value) || 0})} /></div>
                                    <div><label className="text-[10px] font-bold text-blue-500 uppercase">Supplier</label><input type="text" className="w-full p-3 bg-white border border-blue-200 rounded-xl font-bold text-slate-700 outline-none" value={currentItem.primary_supplier || ''} onChange={e => setCurrentItem({...currentItem, primary_supplier: e.target.value})} /></div>
                                </div>
                            )}
                        </div>
                     </div>
                     {/* CHANGED: Removed the !!duplicateWarning check from the disabled property */}
                     <button onClick={handleSaveItem} disabled={isUploading} className="w-full mt-6 py-4 bg-[#6D2158] text-white rounded-xl font-bold uppercase shadow-lg hover:bg-[#5a1b49] transition-all flex items-center justify-center gap-2 disabled:opacity-50"><Save size={18}/> {isEditing ? 'Update Catalog' : 'Save to Catalog'}</button>
                  </div>
               )}

               <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden overflow-x-auto">
                  <div className="min-w-[600px]">
                      <table className="w-full text-left">
                         <thead className="bg-slate-50 border-b border-slate-100">
                            <tr>
                               <th className="p-4 text-xs font-bold text-slate-400 uppercase w-20">HK No</th>
                               <th className="p-4 text-xs font-bold text-slate-400 uppercase">Item Details</th>
                               <th className="p-4 text-xs font-bold text-slate-400 uppercase">Category</th>
                               <th className="p-4 text-xs font-bold text-slate-400 uppercase text-right">Action</th>
                            </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-50">
                            {filteredList.map(item => {
                               const Icon = CATEGORY_ICONS[item.category] || Box;
                               return (
                                 <tr key={item.article_number} className="hover:bg-slate-50 transition-colors group">
                                    <td className="p-4">
                                        <div className="bg-slate-100 text-slate-600 font-mono font-black text-[10px] px-2 py-1 rounded text-center w-max border border-slate-200">
                                            {item.hk_no || '-'}
                                        </div>
                                    </td>
                                    <td className="p-4">
                                       <div className="flex items-center gap-3">
                                           <div className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden flex items-center justify-center border border-slate-100 shrink-0">{item.image_url ? <img src={item.image_url} className="w-full h-full object-cover"/> : <Icon size={18} className="text-slate-400"/>}</div>
                                           <div>
                                               <div className="font-bold text-slate-800 text-sm truncate">{item.generic_name || item.article_name}</div>
                                               <div className="text-[10px] text-slate-400 uppercase truncate">
                                                   {item.article_name} • #{item.article_number} • {item.unit}
                                                   {item.inventory_type && <span className="ml-2 text-indigo-500 font-black tracking-widest">• linked: {item.inventory_type}</span>}
                                               </div>
                                               {item.sub_category && (
                                                   <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1 bg-slate-100 px-2 py-0.5 rounded w-max border border-slate-200">
                                                       Group: {item.sub_category}
                                                   </div>
                                               )}
                                               {item.legacy_ids && (
                                                   <div className="text-[9px] font-black text-amber-500 uppercase tracking-widest mt-1 bg-amber-50 px-2 py-0.5 rounded w-max border border-amber-200">
                                                       Archived IDs: {item.legacy_ids}
                                                   </div>
                                               )}
                                           </div>
                                       </div>
                                    </td>
                                    <td className="p-4 text-xs font-bold text-slate-500">{item.category}</td>
                                    <td className="p-4 text-right flex justify-end gap-1 items-center">
                                       {activeTab === 'Expiry Setup' && (<button onClick={() => handleOpenExpiryBatches(item)} className="px-3 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors text-[10px] font-bold uppercase flex items-center gap-1 shadow-sm"><Calendar size={14}/> Batches</button>)}
                                       
                                       {/* ALWAYS VISIBLE ACTIONS */}
                                       <button onClick={() => {setQrModalItem(item); handlePrintQR();}} className="p-2 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-colors" title="Print QR Code Label"><QrCode size={16}/></button>
                                       <button onClick={() => setMergeModalItem(item)} className="p-2 text-slate-400 hover:bg-amber-50 hover:text-amber-600 rounded-lg transition-colors" title="Merge into another item"><Merge size={16}/></button>
                                       <button onClick={() => handleEditItem(item)} className="p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors"><Edit3 size={16}/></button>
                                       <button onClick={() => handleDeleteItem(item.article_number)} className="p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-500 rounded-lg transition-colors"><Trash2 size={16}/></button>
                                    </td>
                                 </tr>
                               );
                            })}
                         </tbody>
                      </table>
                  </div>
               </div>
            </div>
          )}
        </div>
      </main>

      {/* --- MERGE MODAL --- */}
      {mergeModalItem && (
          <div className="modal-overlay !z-[9999]">
              <div className="modal-content !max-w-md">
                  <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                      <div>
                          <h3 className="text-xl font-black tracking-tight text-slate-800 flex items-center gap-2"><Merge size={20} className="text-amber-500"/> Merge Item</h3>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Combine history & archive old ID</p>
                      </div>
                      <button onClick={() => setMergeModalItem(null)} className="p-2 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200"><X size={18}/></button>
                  </div>
                  
                  <div className="mb-6 space-y-4">
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Old Item (Will be deleted)</p>
                          <div className="font-bold text-slate-800">{mergeModalItem.generic_name || mergeModalItem.article_name} <span className="text-rose-500 font-mono text-sm ml-2">#{mergeModalItem.article_number}</span></div>
                      </div>

                      <div className="flex justify-center text-slate-300"><Merge size={24}/></div>

                      <div>
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Target Item (To merge into)</label>
                          <select className="w-full p-4 mt-1 border-2 border-amber-200 rounded-xl font-bold text-sm bg-amber-50 text-amber-800 outline-none focus:border-amber-400" value={mergeTargetId} onChange={(e) => setMergeTargetId(e.target.value)}>
                              <option value="">Select new item...</option>
                              {masterList.filter(i => i.article_number !== mergeModalItem.article_number && i.is_minibar_item === mergeModalItem.is_minibar_item).map(i => (
                                  <option key={i.article_number} value={i.article_number}>{i.generic_name || i.article_name} (#{i.article_number})</option>
                              ))}
                          </select>
                      </div>
                  </div>

                  <button onClick={handleConfirmMerge} disabled={isMerging || !mergeTargetId} className="w-full py-4 bg-amber-500 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-lg hover:bg-amber-600 transition-colors flex justify-center items-center gap-2 disabled:opacity-50">
                      {isMerging ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>} Merge & Archive Old
                  </button>
              </div>
          </div>
      )}

      {/* --- PREVIEW MODAL --- */}
      {csvPreviewData && (
          <div className="modal-overlay !z-[9999]">
              <div className="modal-content !max-w-5xl flex flex-col h-[80vh]">
                  <div className="flex justify-between items-center mb-6 shrink-0">
                      <div>
                          <h3 className="text-2xl font-black tracking-tight text-slate-800">Review Import</h3>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Found {csvPreviewData.length} items to add or update</p>
                      </div>
                      <button onClick={() => setCsvPreviewData(null)} className="p-2 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200"><X size={18}/></button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl mb-6 custom-scrollbar bg-white">
                      <table className="w-full text-left text-sm">
                          <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 shadow-sm">
                              <tr>
                                  <th className="p-3 font-bold text-slate-500 uppercase text-[10px] tracking-wider">HK No</th>
                                  <th className="p-3 font-bold text-slate-500 uppercase text-[10px] tracking-wider">ID</th>
                                  <th className="p-3 font-bold text-slate-500 uppercase text-[10px] tracking-wider">Display Name</th>
                                  <th className="p-3 font-bold text-slate-500 uppercase text-[10px] tracking-wider">Category</th>
                                  <th className="p-3 font-bold text-slate-500 uppercase text-[10px] tracking-wider">Inventory Link</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                              {csvPreviewData.map((item, idx) => (
                                  <tr key={idx} className="hover:bg-slate-50">
                                      <td className="p-3 font-mono text-xs font-black text-indigo-600">{item.hk_no}</td>
                                      <td className="p-3 font-mono text-xs">{item.article_number}</td>
                                      <td className="p-3 font-bold text-slate-800">{item.generic_name} <span className="block text-[9px] text-slate-400 font-normal">{item.article_name}</span></td>
                                      <td className="p-3 text-xs text-slate-500">{item.category}</td>
                                      <td className="p-3 text-xs font-bold text-indigo-500">{item.inventory_type || '-'}</td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
                  
                  <div className="flex gap-4 shrink-0">
                      <button onClick={() => setCsvPreviewData(null)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-slate-200 transition-colors">Cancel</button>
                      <button onClick={confirmCSVImport} disabled={isUploading} className="flex-1 py-4 bg-emerald-600 text-white rounded-xl font-bold uppercase tracking-widest text-xs shadow-lg hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2">
                          {isUploading ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>} Confirm & Import
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* --- OTHER MODALS (HOST LOGS / EXPIRY) --- */}
      {selectedLogHost && (
          <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95">
                  <div className="p-6 bg-[#6D2158] text-white flex justify-between items-center">
                      <div><h3 className="font-bold text-xl tracking-tight flex items-center gap-2"><History size={20}/> {selectedLogHost.full_name}'s Activity</h3><p className="text-[10px] text-white/70 uppercase tracking-widest mt-1">Latest 50 System Actions</p></div>
                      <button onClick={() => setSelectedLogHost(null)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X size={18}/></button>
                  </div>
                  <div className="p-0 overflow-y-auto flex-1 bg-slate-50 custom-scrollbar">
                     {isLoadingLogs ? (<div className="flex justify-center items-center py-20 text-slate-400"><Loader2 className="animate-spin" size={28}/></div>) : hostLogs.length === 0 ? (<div className="flex justify-center items-center py-20 text-slate-400 font-bold italic text-sm">No recent activity.</div>) : (
                         <table className="w-full text-left text-xs">
                             <thead className="bg-white sticky top-0 border-b border-slate-200 shadow-sm z-10"><tr><th className="p-4 text-slate-400 font-bold uppercase text-[10px]">Time</th><th className="p-4 text-slate-400 font-bold uppercase text-[10px]">Type</th><th className="p-4 text-slate-400 font-bold uppercase text-[10px]">Villa</th><th className="p-4 text-slate-400 font-bold uppercase text-[10px]">Details</th></tr></thead>
                             <tbody className="divide-y divide-slate-100">{hostLogs.map(log => (<tr key={log.id} className="hover:bg-white transition-colors"><td className="p-4 font-medium text-slate-500 whitespace-nowrap">{new Date(log.request_time).toLocaleString('en-GB', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'})}</td><td className="p-4"><span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider ${log.request_type === 'Minibar' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>{log.request_type}</span></td><td className="p-4 font-black text-[#6D2158] text-sm">{log.villa_number}</td><td className="p-4 text-slate-600 truncate max-w-xs">{log.item_details.replace(/\n/g, ', ')}</td></tr>))}</tbody>
                         </table>
                     )}
                  </div>
              </div>
          </div>
      )}

      {selectedExpiryItem && (
          <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95">
                  <div className="p-6 bg-emerald-600 text-white flex justify-between items-center">
                     <div><h3 className="font-bold text-xl tracking-tight flex items-center gap-2"><Calendar size={20}/> Batch Tracking</h3><p className="text-[10px] text-white/70 uppercase tracking-widest mt-1">{selectedExpiryItem.article_name}</p></div>
                     <button onClick={() => setSelectedExpiryItem(null)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X size={18}/></button>
                  </div>
                  <div className="p-6 border-b border-slate-100 bg-slate-50 flex gap-2">
                      <input type="month" className="flex-1 p-3 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-emerald-500" value={newBatchDate} onChange={(e) => setNewBatchDate(e.target.value)}/>
                      <button onClick={handleAddBatchDate} className="px-5 py-3 bg-emerald-600 text-white rounded-xl font-bold uppercase text-xs shadow-md transition-colors flex items-center gap-2"><Plus size={16}/> Add</button>
                  </div>
                  <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-3">
                     {isLoadingBatches ? (<div className="flex justify-center items-center py-10 text-slate-400"><Loader2 className="animate-spin" size={28}/></div>) : itemBatches.length === 0 ? (<div className="flex justify-center items-center py-10 text-slate-400 font-bold italic text-sm">No active batches.</div>) : (
                         itemBatches.map(batch => {
                             let displayDate = batch.expiry_date;
                             try { displayDate = format(parseISO(batch.expiry_date + "-01"), 'MMM yyyy'); } catch (e) {}
                             return (<div key={batch.id} className="flex justify-between items-center p-4 bg-white border border-slate-200 rounded-2xl shadow-sm group hover:border-rose-200"><div className="font-black text-slate-700">{displayDate}</div><button onClick={() => handleArchiveBatch(batch.id)} className="text-slate-300 hover:text-rose-600 bg-slate-50 hover:bg-rose-50 p-2 rounded-lg text-[10px] font-bold uppercase flex items-center gap-1"><Trash2 size={14}/> Remove</button></div>);
                         })
                     )}
                  </div>
              </div>
          </div>
      )}

      {accessModalHost && (
          <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-[#FDFBFD] w-full max-w-2xl rounded-[2.5rem] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95">
                  <div className="p-6 md:p-8 bg-[#6D2158] text-white flex justify-between items-center shrink-0">
                      <div><h3 className="font-black text-xl tracking-tight flex items-center gap-2"><Eye size={20}/> Manage View Access</h3><p className="text-[10px] text-white/70 uppercase tracking-widest mt-1">For: {accessModalHost.full_name}</p></div>
                      <button onClick={closeAccessModal} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X size={18}/></button>
                  </div>
                  <div className="p-6 border-b border-slate-200 bg-white shrink-0 flex gap-4 items-center">
                       <div className="relative flex-1">
                           <Search className="absolute left-3 top-3 text-slate-400" size={16}/>
                           <input type="text" placeholder="Search by name..." className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#6D2158]" value={accessSearchQuery} onChange={e => setAccessSearchQuery(e.target.value)}/>
                       </div>
                  </div>
                  <div className="p-6 overflow-y-auto flex-1 custom-scrollbar bg-slate-50">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {activeHosts.filter(h => h.id !== accessModalHost.id && (h.full_name.toLowerCase().includes(accessSearchQuery.toLowerCase()) || h.host_id.toLowerCase().includes(accessSearchQuery.toLowerCase()) || (h.role || '').toLowerCase().includes(accessSearchQuery.toLowerCase()))).map(targetHost => {
                              const isSelected = (supervisorAccess[accessModalHost.host_id] || []).includes(targetHost.host_id);
                              return (
                                  <label key={targetHost.id} className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${isSelected ? 'bg-purple-50 border-purple-200 shadow-sm' : 'bg-white border-slate-200 hover:border-[#6D2158]'}`}>
                                      <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${isSelected ? 'bg-[#6D2158] border-[#6D2158]' : 'bg-slate-50 border-slate-300'}`}>{isSelected && <CheckCircle2 size={14} className="text-white"/>}</div>
                                      <div className="flex-1 min-w-0"><div className="font-bold text-sm text-slate-800 truncate">{targetHost.full_name}</div><div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{targetHost.role}</div></div>
                                      <input type="checkbox" className="hidden" checked={isSelected} onChange={() => {
                                          setSupervisorAccess((prev: any) => {
                                              const current = prev[accessModalHost.host_id] || [];
                                              if (current.includes(targetHost.host_id)) return { ...prev, [accessModalHost.host_id]: current.filter((id: any) => id !== targetHost.host_id) };
                                              return { ...prev, [accessModalHost.host_id]: [...current, targetHost.host_id] };
                                          });
                                      }}/>
                                  </label>
                              );
                          })}
                      </div>
                  </div>
                  <div className="p-4 bg-white border-t border-slate-200 shrink-0 flex gap-2">
                      <button onClick={() => {
                          const shown = activeHosts.filter(h => h.id !== accessModalHost.id && (h.full_name.toLowerCase().includes(accessSearchQuery.toLowerCase()) || (h.role || '').toLowerCase().includes(accessSearchQuery.toLowerCase()))).map(h => h.host_id);
                          setSupervisorAccess(prev => ({ ...prev, [accessModalHost.host_id]: Array.from(new Set([...(prev[accessModalHost.host_id] || []), ...shown])) }));
                      }} className="px-4 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs uppercase hover:bg-slate-200">Select shown</button>
                      <button onClick={() => setSupervisorAccess(prev => ({ ...prev, [accessModalHost.host_id]: [] }))} className="px-4 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs uppercase hover:bg-slate-200">Clear</button>
                      <button onClick={closeAccessModal} disabled={isUploading} className="flex-1 py-3 bg-[#6D2158] text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2">{isUploading ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} Save · {(supervisorAccess[accessModalHost.host_id] || []).filter(id => activeIds.has(id)).length} selected</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}
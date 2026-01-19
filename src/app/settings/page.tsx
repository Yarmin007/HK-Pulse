"use client";
import React, { useState, useEffect } from 'react';
import { 
  Settings, Save, Plus, Trash2, X, Search,
  Layers, MapPin, Briefcase, Tag, AlertTriangle,
  Coffee, Droplet, Beer, Wine, Cookie, Zap,
  Cloud, Moon, Sun, Umbrella, Baby, Star, Box
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// --- CONFIG ---
const CATEGORY_ICONS: any = {
  'Soft Drinks': Coffee, 'Juices': Coffee, 'Water': Droplet,
  'Beer': Beer, 'Wines': Wine, 'Spirits': Wine,
  'Bites': Cookie, 'Sweets': Cookie, 'Retail': Zap,
  'Pillow Menu': Cloud, 'Baby Items': Baby, 'Toiletries': Droplet,
  'General': Box, 'Chemicals': AlertTriangle, 'Linen': Layers
};

const MASTER_CATEGORIES = [
  // Minibar
  'Bites', 'Sweets', 'Soft Drinks', 'Juices', 'Water', 'Beer', 'Spirits', 'Wines', 'Retail',
  // Amenities
  'Pillow Menu', 'Baby Items', 'Toiletries', 'General Requests',
  // Operational
  'Chemicals', 'Linen', 'Stationery', 'Engineering', 'Cleaning Supplies'
];

// --- TYPES ---
type MasterItem = {
  article_number: string;
  article_name: string;
  unit: string;
  category: string;
  is_minibar_item: boolean;
  micros_name: string;
  sales_price: number;
};

type Constant = {
  id: string;
  type: string;
  label: string;
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('Master Inventory');
  const [searchQuery, setSearchQuery] = useState('');
  
  // --- STATE: MASTER LIST ---
  const [masterList, setMasterList] = useState<MasterItem[]>([]);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [newItem, setNewItem] = useState<MasterItem>({
    article_number: '', article_name: '', unit: 'Each', category: 'General',
    is_minibar_item: false, micros_name: '', sales_price: 0
  });

  // --- STATE: SYSTEM CONSTANTS ---
  const [constants, setConstants] = useState<Constant[]>([]);
  const [newConstantValue, setNewConstantValue] = useState('');
  const [activeConstantType, setActiveConstantType] = useState('');

  // --- INIT ---
  useEffect(() => {
    fetchMasterList();
    fetchConstants();
  }, []);

  // --- DATA FETCHING ---
  const fetchMasterList = async () => {
    const { data } = await supabase.from('hsk_master_catalog').select('*').order('article_name');
    if (data) setMasterList(data);
  };

  const fetchConstants = async () => {
    const { data } = await supabase.from('hsk_constants').select('*').order('label');
    if (data) setConstants(data);
  };

  // --- HANDLERS: MASTER LIST ---
  const handleSaveItem = async () => {
    if (!newItem.article_number || !newItem.article_name) return alert("Article Number and Name are required.");

    // Smart defaults
    const finalData = {
      ...newItem,
      // If Minibar item, ensure Micros Name exists (default to Article Name)
      micros_name: newItem.is_minibar_item && !newItem.micros_name ? newItem.article_name : newItem.micros_name
    };

    const { error } = await supabase.from('hsk_master_catalog').upsert(finalData);
    
    if (error) {
      alert("Error saving: " + error.message);
    } else {
      setIsAddingItem(false);
      setNewItem({ 
        article_number: '', article_name: '', unit: 'Each', category: 'General', 
        is_minibar_item: false, micros_name: '', sales_price: 0 
      });
      fetchMasterList();
    }
  };

  const handleDeleteItem = async (id: string) => {
    if(!confirm("Delete this item from Master List?")) return;
    await supabase.from('hsk_master_catalog').delete().eq('article_number', id);
    fetchMasterList();
  };

  // --- HANDLERS: CONSTANTS ---
  const handleAddConstant = async (type: string) => {
    if (!newConstantValue.trim()) return;
    const { error } = await supabase.from('hsk_constants').insert({ type, label: newConstantValue });
    if (!error) {
      setNewConstantValue('');
      fetchConstants();
    }
  };

  const handleDeleteConstant = async (id: string) => {
    if (!confirm('Remove this value?')) return;
    await supabase.from('hsk_constants').delete().eq('id', id);
    fetchConstants();
  };

  // --- COMPONENT: LIST MANAGER ---
  const ListManager = ({ type, title, icon: Icon, placeholder }: any) => {
    const list = constants.filter(c => c.type === type);
    return (
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-6">
        <div className="flex items-center gap-2 mb-4 text-[#6D2158]">
          <Icon size={20} />
          <h3 className="text-lg font-bold">{title}</h3>
        </div>
        
        <div className="flex gap-2 mb-4">
          <input 
            type="text" 
            placeholder={placeholder} 
            className="flex-1 p-3 border rounded-xl font-bold text-sm bg-slate-50 focus:border-[#6D2158] outline-none"
            value={activeConstantType === type ? newConstantValue : ''}
            onChange={(e) => { setActiveConstantType(type); setNewConstantValue(e.target.value); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddConstant(type); }}
          />
          <button onClick={() => handleAddConstant(type)} className="px-4 py-2 bg-[#6D2158] text-white rounded-xl font-bold uppercase text-xs hover:shadow-lg">
            <Plus size={16}/> Add
          </button>
        </div>

        <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
           {list.map(item => (
             <div key={item.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg group hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-100 transition-all">
                <span className="font-bold text-slate-600 text-sm">{item.label}</span>
                <button onClick={() => handleDeleteConstant(item.id)} className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={16}/></button>
             </div>
           ))}
           {list.length === 0 && <p className="text-xs text-slate-400 italic">No items defined.</p>}
        </div>
      </div>
    );
  };

  // Filter Master List
  const filteredMasterList = masterList.filter(item => 
    item.article_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    item.article_number.includes(searchQuery)
  );

  return (
    <div className="min-h-screen p-6 pb-20 bg-[#FDFBFD] font-antiqua text-[#6D2158]">
      
      {/* PAGE HEADER */}
      <div className="border-b border-slate-200 pb-6 mb-6">
        <h1 className="text-3xl font-bold tracking-tight">System Settings</h1>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">
          Configuration & Master Data
        </p>
      </div>

      {/* TABS */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-2 no-scrollbar">
         {['Master Inventory', 'System Config', 'App Defaults'].map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all ${activeTab === tab ? 'bg-[#6D2158] text-white shadow-lg shadow-[#6D2158]/20' : 'bg-white text-slate-400 border border-slate-100 hover:border-[#6D2158]'}`}
            >
              {tab}
            </button>
         ))}
      </div>

      {/* --- TAB 1: MASTER INVENTORY --- */}
      {activeTab === 'Master Inventory' && (
        <div className="animate-in slide-in-from-right-4 duration-300">
           
           {/* Controls */}
           <div className="flex justify-between items-center mb-6">
              <div className="relative w-full max-w-md">
                 <Search className="absolute left-3 top-3 text-slate-400" size={18}/>
                 <input 
                    type="text" 
                    placeholder="Search Article No or Name..." 
                    className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-[#6D2158]"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                 />
              </div>
              <button onClick={() => setIsAddingItem(!isAddingItem)} className="ml-4 bg-[#6D2158] text-white px-5 py-3 rounded-xl text-xs font-bold uppercase flex items-center gap-2 shadow-lg whitespace-nowrap">
                 {isAddingItem ? <X size={18}/> : <Plus size={18}/>}
                 {isAddingItem ? 'Cancel' : 'New Item'}
              </button>
           </div>

           {/* ADD FORM */}
           {isAddingItem && (
              <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-100 mb-8 animate-in slide-in-from-top-4">
                 <h3 className="text-lg font-bold text-slate-700 mb-4">Add to Master Catalog</h3>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                       <label className="text-xs font-bold text-slate-400 uppercase ml-1">Article Number (Unique)</label>
                       <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:border-[#6D2158]" placeholder="e.g. 151001" value={newItem.article_number} onChange={e => setNewItem({...newItem, article_number: e.target.value})} />
                    </div>
                    <div className="md:col-span-2">
                       <label className="text-xs font-bold text-slate-400 uppercase ml-1">Article Name</label>
                       <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:border-[#6D2158]" placeholder="e.g. Coke Zero 330ml" value={newItem.article_name} onChange={e => setNewItem({...newItem, article_name: e.target.value})} />
                    </div>
                    <div>
                       <label className="text-xs font-bold text-slate-400 uppercase ml-1">Category</label>
                       <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none" value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})}>
                          {MASTER_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                       </select>
                    </div>
                    <div>
                       <label className="text-xs font-bold text-slate-400 uppercase ml-1">Unit</label>
                       <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none" value={newItem.unit} onChange={e => setNewItem({...newItem, unit: e.target.value})}>
                          <option>Each</option><option>Kg</option><option>Ltr</option><option>Box</option><option>Set</option><option>Pack</option>
                       </select>
                    </div>
                    
                    {/* Minibar Toggle */}
                    <div className="flex items-center gap-3 pt-6">
                       <input type="checkbox" id="mbToggle" className="w-5 h-5 accent-[#6D2158]" checked={newItem.is_minibar_item} onChange={e => setNewItem({...newItem, is_minibar_item: e.target.checked})} />
                       <label htmlFor="mbToggle" className="text-sm font-bold text-slate-700 cursor-pointer">Is Minibar Item?</label>
                    </div>
                 </div>

                 {/* Extra Fields for Minibar */}
                 {newItem.is_minibar_item && (
                    <div className="mt-4 p-4 bg-rose-50 rounded-xl border border-rose-100 grid grid-cols-2 gap-4 animate-in fade-in">
                       <div>
                          <label className="text-xs font-bold text-rose-400 uppercase">Micros Name (POS)</label>
                          <input className="w-full p-3 bg-white border border-rose-200 rounded-xl font-bold text-slate-700 outline-none" placeholder="Same as Article Name if empty" value={newItem.micros_name} onChange={e => setNewItem({...newItem, micros_name: e.target.value})} />
                       </div>
                       <div>
                          <label className="text-xs font-bold text-rose-400 uppercase">Sales Price ($)</label>
                          <input type="number" className="w-full p-3 bg-white border border-rose-200 rounded-xl font-bold text-slate-700 outline-none" value={newItem.sales_price} onChange={e => setNewItem({...newItem, sales_price: parseFloat(e.target.value)})} />
                       </div>
                    </div>
                 )}

                 <button onClick={handleSaveItem} className="w-full mt-6 py-3 bg-[#6D2158] text-white rounded-xl font-bold uppercase shadow-lg hover:bg-[#5a1b49]">Save to Master List</button>
              </div>
           )}

           {/* LIST */}
           <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <table className="w-full text-left">
                 <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                       <th className="p-4 text-xs font-bold text-slate-400 uppercase">Art. No</th>
                       <th className="p-4 text-xs font-bold text-slate-400 uppercase">Name</th>
                       <th className="p-4 text-xs font-bold text-slate-400 uppercase">Category</th>
                       <th className="p-4 text-xs font-bold text-slate-400 uppercase text-right">Action</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                    {filteredMasterList.length === 0 && (
                       <tr><td colSpan={4} className="p-8 text-center text-slate-400 italic">No items found.</td></tr>
                    )}
                    {filteredMasterList.map(item => {
                       const Icon = CATEGORY_ICONS[item.category] || Box;
                       return (
                         <tr key={item.article_number} className="hover:bg-slate-50">
                            <td className="p-4 text-xs font-bold text-slate-400 font-mono">{item.article_number}</td>
                            <td className="p-4 text-sm font-bold text-slate-700 flex items-center gap-3">
                               <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400">
                                  <Icon size={16}/>
                               </div>
                               <div>
                                  {item.article_name}
                                  {item.is_minibar_item && <span className="ml-2 px-2 py-0.5 bg-rose-100 text-rose-600 text-[9px] rounded uppercase font-bold">Minibar</span>}
                               </div>
                            </td>
                            <td className="p-4 text-xs font-bold text-slate-500">{item.category}</td>
                            <td className="p-4 text-right">
                               <button onClick={() => handleDeleteItem(item.article_number)} className="text-slate-300 hover:text-rose-500 p-2"><Trash2 size={16}/></button>
                            </td>
                         </tr>
                       );
                    })}
                 </tbody>
              </table>
           </div>
        </div>
      )}

      {/* --- TAB 2: SYSTEM CONFIG --- */}
      {activeTab === 'System Config' && (
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in slide-in-from-right-4 duration-300">
            <ListManager type="cost_center" title="Cost Centers" icon={Briefcase} placeholder="e.g. Spa, Front Office..." />
            <ListManager type="category" title="Inventory Categories" icon={Layers} placeholder="e.g. Cleaning Tools..." />
            <ListManager type="unit" title="Measurement Units" icon={Tag} placeholder="e.g. Pack, Bottle..." />
            <ListManager type="zone" title="Resort Zones / Jetties" icon={MapPin} placeholder="e.g. Water Villa Jetty..." />
         </div>
      )}

      {/* --- TAB 3: APP DEFAULTS --- */}
      {activeTab === 'App Defaults' && (
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in slide-in-from-right-4 duration-300">
             {/* General App Info */}
             <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 mb-6 text-[#6D2158]">
                   <Settings size={20} />
                   <h3 className="text-lg font-bold">General Defaults</h3>
                </div>
                <div className="space-y-4">
                   <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Resort / Property Name</label>
                      <input type="text" defaultValue="Atmosphere Kanifushi" className="w-full p-3 border rounded-xl font-bold text-sm text-slate-700 bg-slate-50"/>
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Currency</label>
                        <select className="w-full p-3 border rounded-xl font-bold text-sm text-slate-700 bg-slate-50">
                           <option>USD ($)</option>
                           <option>MVR (Rf)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Timezone</label>
                        <select className="w-full p-3 border rounded-xl font-bold text-sm text-slate-700 bg-slate-50">
                           <option>Male' (GMT+5)</option>
                        </select>
                      </div>
                   </div>
                   <button className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider mt-2">
                      <Save size={16}/> Save Defaults
                   </button>
                </div>
             </div>

             {/* Alerts */}
             <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 mb-6 text-amber-600">
                   <AlertTriangle size={20} />
                   <h3 className="text-lg font-bold">Alert Thresholds</h3>
                </div>
                <div>
                   <label className="text-[10px] font-bold text-slate-400 uppercase">Minibar Expiry Warning (Days)</label>
                   <div className="flex gap-2 mt-1">
                      <input type="number" defaultValue={30} className="w-24 p-3 border rounded-xl font-bold text-sm text-slate-700 bg-slate-50 text-center"/>
                      <span className="flex items-center text-xs font-bold text-slate-400">days before expiry</span>
                   </div>
                </div>
             </div>
         </div>
      )}

    </div>
  );
}
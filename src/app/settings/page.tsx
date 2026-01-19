"use client";
import React, { useState, useEffect } from 'react';
import { 
  Settings, Save, Plus, Trash2, X,
  Layers, MapPin, Briefcase, Tag, AlertTriangle,
  Coffee, Droplet, Beer, Wine, Cookie, Zap,
  Cloud, Moon, Sun, Umbrella, Baby, Star
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// --- CONFIG ---
const ICON_MAP: any = {
  'Coffee': Coffee, 'Droplet': Droplet, 'Beer': Beer, 
  'Wine': Wine, 'Cookie': Cookie, 'Zap': Zap,
  'Cloud': Cloud, 'Moon': Moon, 'Sun': Sun, 
  'Umbrella': Umbrella, 'Baby': Baby, 'Star': Star
};

const MINIBAR_CATEGORIES = ['Bites', 'Sweets', 'Soft Drinks', 'Juices', 'Water', 'Beer', 'Spirits', 'Wines', 'Retail'];
// Updated Categories
const AMENITY_CATEGORIES = ['Pillow Menu', 'Baby Items', 'Toiletries', 'General'];

const COLORS = [
  { label: 'Red', val: 'bg-red-100 text-red-800' },
  { label: 'Green', val: 'bg-green-100 text-green-800' },
  { label: 'Blue', val: 'bg-blue-100 text-blue-800' },
  { label: 'Amber', val: 'bg-amber-100 text-amber-800' },
  { label: 'Rose', val: 'bg-rose-100 text-rose-800' },
  { label: 'Yellow', val: 'bg-yellow-100 text-yellow-800' },
  { label: 'Cyan', val: 'bg-cyan-100 text-cyan-800' },
  { label: 'Slate', val: 'bg-slate-100 text-slate-800' },
];

// --- TYPES ---
type CatalogItem = {
  id: string;
  micros_name: string;
  article_name: string;
  article_number: string;
  category: string;
  icon: string;
  color: string;
};

type AmenityItem = {
  id: string;
  name: string;
  category: string;
  icon: string;
};

type Constant = {
  id: string;
  type: string;
  label: string;
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('Minibar Catalog');
  
  // --- STATE: MINIBAR ---
  const [minibarItems, setMinibarItems] = useState<CatalogItem[]>([]);
  const [minibarCategoryFilter, setMinibarCategoryFilter] = useState('All');
  const [isAddingMinibar, setIsAddingMinibar] = useState(false);
  const [newMinibarItem, setNewMinibarItem] = useState({
    micros_name: '', article_name: '', article_number: '', 
    category: 'Soft Drinks', icon: 'Coffee', color: 'bg-slate-100 text-slate-800'
  });

  // --- STATE: AMENITIES ---
  const [amenityItems, setAmenityItems] = useState<AmenityItem[]>([]);
  const [isAddingAmenity, setIsAddingAmenity] = useState(false);
  const [newAmenityItem, setNewAmenityItem] = useState({
    name: '', category: 'Pillow Menu', icon: 'Cloud'
  });

  // --- STATE: SYSTEM CONSTANTS ---
  const [constants, setConstants] = useState<Constant[]>([]);
  const [newConstantValue, setNewConstantValue] = useState('');
  const [activeConstantType, setActiveConstantType] = useState('');

  // --- INIT ---
  useEffect(() => {
    fetchMinibarCatalog();
    fetchAmenityCatalog();
    fetchConstants();
  }, []);

  // --- DATA FETCHING ---
  const fetchMinibarCatalog = async () => {
    const { data } = await supabase.from('hsk_minibar_catalog').select('*').order('micros_name');
    if (data) setMinibarItems(data);
  };

  const fetchAmenityCatalog = async () => {
    const { data } = await supabase.from('hsk_amenities_catalog').select('*').order('name');
    if (data) setAmenityItems(data);
  };

  const fetchConstants = async () => {
    const { data } = await supabase.from('hsk_constants').select('*').order('label');
    if (data) setConstants(data);
  };

  // --- HANDLERS: MINIBAR ---
  const handleAddMinibar = async () => {
    if(!newMinibarItem.micros_name) return alert("Enter Micros Name");
    await supabase.from('hsk_minibar_catalog').insert(newMinibarItem);
    setIsAddingMinibar(false);
    setNewMinibarItem({ micros_name: '', article_name: '', article_number: '', category: 'Soft Drinks', icon: 'Coffee', color: 'bg-slate-100 text-slate-800' });
    fetchMinibarCatalog();
  };

  const handleDeleteMinibar = async (id: string) => {
    if(!confirm("Delete this item?")) return;
    await supabase.from('hsk_minibar_catalog').delete().eq('id', id);
    fetchMinibarCatalog();
  };

  // --- HANDLERS: AMENITIES ---
  const handleAddAmenity = async () => {
    if(!newAmenityItem.name) return alert("Enter Name");
    await supabase.from('hsk_amenities_catalog').insert(newAmenityItem);
    setIsAddingAmenity(false);
    setNewAmenityItem({ name: '', category: 'Pillow Menu', icon: 'Cloud' });
    fetchAmenityCatalog();
  };

  const handleDeleteAmenity = async (id: string) => {
    if(!confirm("Delete this amenity?")) return;
    await supabase.from('hsk_amenities_catalog').delete().eq('id', id);
    fetchAmenityCatalog();
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
          <button 
            onClick={() => handleAddConstant(type)}
            className="px-4 py-2 bg-[#6D2158] text-white rounded-xl font-bold uppercase text-xs hover:shadow-lg"
          >
            <Plus size={16}/> Add
          </button>
        </div>

        <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
           {list.map(item => (
             <div key={item.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg group hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-100 transition-all">
                <span className="font-bold text-slate-600 text-sm">{item.label}</span>
                <button onClick={() => handleDeleteConstant(item.id)} className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
                   <Trash2 size={16}/>
                </button>
             </div>
           ))}
           {list.length === 0 && <p className="text-xs text-slate-400 italic">No items defined.</p>}
        </div>
      </div>
    );
  };

  // Filter Minibar Items
  const filteredMinibar = minibarCategoryFilter === 'All' ? minibarItems : minibarItems.filter(i => i.category === minibarCategoryFilter);

  return (
    <div className="min-h-screen p-6 pb-20 bg-[#FDFBFD] font-antiqua text-[#6D2158]">
      
      {/* PAGE HEADER */}
      <div className="border-b border-slate-200 pb-6 mb-6">
        <h1 className="text-3xl font-bold tracking-tight">System Settings</h1>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">
          Configuration & Catalog Manager
        </p>
      </div>

      {/* TABS */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-2 no-scrollbar">
         {['Minibar Catalog', 'Guest Amenities', 'System Config', 'App Defaults'].map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all ${activeTab === tab ? 'bg-[#6D2158] text-white shadow-lg shadow-[#6D2158]/20' : 'bg-white text-slate-400 border border-slate-100 hover:border-[#6D2158]'}`}
            >
              {tab}
            </button>
         ))}
      </div>

      {/* --- TAB 1: MINIBAR CATALOG --- */}
      {activeTab === 'Minibar Catalog' && (
        <div className="animate-in slide-in-from-right-4 duration-300">
           
           {/* Add Button & Filter */}
           <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
              <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar w-full md:w-auto">
                 <button onClick={() => setMinibarCategoryFilter('All')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase border whitespace-nowrap ${minibarCategoryFilter === 'All' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-200 text-slate-400'}`}>All</button>
                 {MINIBAR_CATEGORIES.map(c => (
                    <button key={c} onClick={() => setMinibarCategoryFilter(c)} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase border whitespace-nowrap ${minibarCategoryFilter === c ? 'bg-[#6D2158] text-white border-[#6D2158]' : 'bg-white border-slate-200 text-slate-400'}`}>{c}</button>
                 ))}
              </div>
              <button onClick={() => setIsAddingMinibar(!isAddingMinibar)} className="bg-[#6D2158] text-white px-4 py-2 rounded-xl text-xs font-bold uppercase flex items-center gap-2 shadow-lg whitespace-nowrap">
                 {isAddingMinibar ? <X size={16}/> : <Plus size={16}/>}
                 {isAddingMinibar ? 'Cancel' : 'Add Item'}
              </button>
           </div>

           {/* Add Form */}
           {isAddingMinibar && (
              <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-100 mb-8 animate-in slide-in-from-top-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase ml-1">Micros Name (POS)</label>
                    <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none" placeholder="e.g. Coca Cola MB" value={newMinibarItem.micros_name} onChange={e => setNewMinibarItem({...newMinibarItem, micros_name: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase ml-1">Article Number</label>
                    <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none" placeholder="e.g. 2501001" value={newMinibarItem.article_number} onChange={e => setNewMinibarItem({...newMinibarItem, article_number: e.target.value})} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-bold text-slate-400 uppercase ml-1">Article Name (Full Description)</label>
                    <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none" placeholder="e.g. SD Coca Cola Can 330ml" value={newMinibarItem.article_name} onChange={e => setNewMinibarItem({...newMinibarItem, article_name: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase ml-1">Category</label>
                    <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none" value={newMinibarItem.category} onChange={e => setNewMinibarItem({...newMinibarItem, category: e.target.value})}>
                      {MINIBAR_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                     <label className="text-xs font-bold text-slate-400 uppercase ml-1">Icon & Color</label>
                     <div className="flex gap-2 mt-2">
                        <div className="flex gap-1 bg-slate-50 p-1 rounded-lg overflow-x-auto">
                          {Object.keys(ICON_MAP).map(iconKey => {
                             const IconComp = ICON_MAP[iconKey];
                             return <button key={iconKey} onClick={() => setNewMinibarItem({...newMinibarItem, icon: iconKey})} className={`p-2 rounded-lg ${newMinibarItem.icon === iconKey ? 'bg-white shadow' : 'text-slate-400'}`}><IconComp size={16}/></button>
                          })}
                        </div>
                     </div>
                  </div>
                  <div className="md:col-span-2">
                     <label className="text-xs font-bold text-slate-400 uppercase ml-1">Color Theme</label>
                     <div className="flex gap-2 mt-2 overflow-x-auto pb-2">
                        {COLORS.map(c => (
                          <button key={c.label} onClick={() => setNewMinibarItem({...newMinibarItem, color: c.val})} className={`px-4 py-2 rounded-lg text-xs font-bold border whitespace-nowrap ${newMinibarItem.color === c.val ? 'border-slate-800 ring-2 ring-slate-200' : 'border-transparent'} ${c.val}`}>{c.label}</button>
                        ))}
                     </div>
                  </div>
                </div>
                <button onClick={handleAddMinibar} className="w-full mt-6 py-3 bg-emerald-600 text-white rounded-xl font-bold uppercase shadow-lg hover:bg-emerald-700">Save Item</button>
              </div>
           )}

           {/* Grid */}
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredMinibar.map(item => {
                 const IconComp = ICON_MAP[item.icon] || Coffee;
                 return (
                   <div key={item.id} className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between group">
                      <div className="flex items-center gap-3">
                         <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${item.color}`}>
                            <IconComp size={20}/>
                         </div>
                         <div className="min-w-0">
                            <h3 className="font-bold text-sm text-slate-700 truncate">{item.micros_name}</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">{item.article_number || 'No ID'} • {item.category}</p>
                         </div>
                      </div>
                      <button onClick={() => handleDeleteMinibar(item.id)} className="text-slate-200 hover:text-rose-500 p-2"><Trash2 size={16}/></button>
                   </div>
                 )
              })}
           </div>
        </div>
      )}

      {/* --- TAB 2: GUEST AMENITIES (NEW) --- */}
      {activeTab === 'Guest Amenities' && (
        <div className="animate-in slide-in-from-right-4 duration-300">
           
           <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-700">On-Request Items</h3>
              <button onClick={() => setIsAddingAmenity(!isAddingAmenity)} className="bg-[#6D2158] text-white px-4 py-2 rounded-xl text-xs font-bold uppercase flex items-center gap-2 shadow-lg">
                 {isAddingAmenity ? <X size={16}/> : <Plus size={16}/>}
                 {isAddingAmenity ? 'Cancel' : 'Add New'}
              </button>
           </div>

           {/* Add Amenity Form */}
           {isAddingAmenity && (
              <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-100 mb-8 animate-in slide-in-from-top-4">
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                       <label className="text-xs font-bold text-slate-400 uppercase ml-1">Item Name</label>
                       <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none" placeholder="e.g. Body Pillow" value={newAmenityItem.name} onChange={e => setNewAmenityItem({...newAmenityItem, name: e.target.value})} />
                    </div>
                    <div>
                       <label className="text-xs font-bold text-slate-400 uppercase ml-1">Category</label>
                       <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none" value={newAmenityItem.category} onChange={e => setNewAmenityItem({...newAmenityItem, category: e.target.value})}>
                          {AMENITY_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                       </select>
                    </div>
                    <div>
                       <label className="text-xs font-bold text-slate-400 uppercase ml-1">Icon</label>
                       <div className="flex gap-2 mt-2 bg-slate-50 p-1 rounded-lg overflow-x-auto">
                          {['Cloud', 'Moon', 'Sun', 'Baby', 'Star', 'Zap'].map(iconKey => {
                             const IconComp = ICON_MAP[iconKey] || Zap;
                             return <button key={iconKey} onClick={() => setNewAmenityItem({...newAmenityItem, icon: iconKey})} className={`p-2 rounded-lg ${newAmenityItem.icon === iconKey ? 'bg-white shadow' : 'text-slate-400'}`}><IconComp size={16}/></button>
                          })}
                       </div>
                    </div>
                 </div>
                 <button onClick={handleAddAmenity} className="w-full mt-6 py-3 bg-[#6D2158] text-white rounded-xl font-bold uppercase shadow-lg">Save Amenity</button>
              </div>
           )}

           {/* Amenity List */}
           <div className="space-y-4">
              {AMENITY_CATEGORIES.map(cat => {
                 const items = amenityItems.filter(i => i.category === cat);
                 if (items.length === 0) return null;
                 return (
                    <div key={cat} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                       <h4 className="font-bold text-slate-400 uppercase text-xs mb-3">{cat}</h4>
                       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {items.map(item => {
                             const IconComp = ICON_MAP[item.icon] || Cloud;
                             return (
                                <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                                   <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-[#6D2158] shadow-sm"><IconComp size={16}/></div>
                                      <span className="font-bold text-sm text-slate-700">{item.name}</span>
                                   </div>
                                   <button onClick={() => handleDeleteAmenity(item.id)} className="text-slate-300 hover:text-rose-500"><Trash2 size={14}/></button>
                                </div>
                             )
                          })}
                       </div>
                    </div>
                 )
              })}
           </div>
        </div>
      )}

      {/* --- TAB 3: SYSTEM CONFIG --- */}
      {activeTab === 'System Config' && (
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in slide-in-from-right-4 duration-300">
            <ListManager type="cost_center" title="Cost Centers" icon={Briefcase} placeholder="e.g. Spa, Front Office..." />
            <ListManager type="category" title="Inventory Categories" icon={Layers} placeholder="e.g. Cleaning Tools..." />
            <ListManager type="unit" title="Measurement Units" icon={Tag} placeholder="e.g. Pack, Bottle..." />
            <ListManager type="zone" title="Resort Zones / Jetties" icon={MapPin} placeholder="e.g. Water Villa Jetty..." />
         </div>
      )}

      {/* --- TAB 4: APP DEFAULTS --- */}
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
"use client";
import React, { useState, useEffect, useRef } from 'react';
import { 
  Settings, Save, Plus, Trash2, X, Search, Edit3, Image as ImageIcon,
  Layers, MapPin, Briefcase, Tag, AlertTriangle, Calendar,
  Coffee, Droplet, Beer, Wine, Cookie, Zap,
  Cloud, Moon, Sun, Umbrella, Baby, Star, Box, Users, CheckCircle, Loader2, UploadCloud
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// --- CONFIG ---
const CATEGORY_ICONS: any = {
  'Soft Drinks': Coffee, 'Juices': Coffee, 'Water': Droplet,
  'Beer': Beer, 'Wines': Wine, 'Spirits': Wine,
  'Bites': Cookie, 'Sweets': Cookie, 'Retail': Zap,
  'Pillow Menu': Cloud, 'Baby Items': Baby, 'Toiletries': Droplet,
  'General Requests': Box, 'Chemicals': AlertTriangle, 'Linen': Layers
};

const MASTER_CATEGORIES = [
  'Bites', 'Sweets', 'Soft Drinks', 'Juices', 'Water', 'Beer', 'Spirits', 'Wines', 'Retail',
  'Pillow Menu', 'Baby Items', 'Toiletries', 'General Requests',
  'Chemicals', 'Linen', 'Stationery', 'Engineering', 'Cleaning Supplies'
];

// --- TYPES ---
type MasterItem = {
  article_number: string;
  article_name: string;   // Keeping Article Name
  generic_name: string;   // ADDED: Your short/generic name
  unit: string;
  category: string;
  is_minibar_item: boolean;
  micros_name: string;    // Keeping Micros Name
  sales_price: number;
  image_url?: string; 
  has_expiry: boolean; 
};

type Constant = {
  id: string;
  type: string;
  label: string;
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('Master List');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [masterList, setMasterList] = useState<MasterItem[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const defaultItemState: MasterItem = {
    article_number: '', article_name: '', generic_name: '', unit: 'Each', category: 'General Requests',
    is_minibar_item: false, micros_name: '', sales_price: 0,
    image_url: '', has_expiry: false
  };
  
  const [currentItem, setCurrentItem] = useState<MasterItem>(defaultItemState);
  const [constants, setConstants] = useState<Constant[]>([]);
  const [newConstantValue, setNewConstantValue] = useState('');
  const [activeConstantType, setActiveConstantType] = useState('');

  useEffect(() => { fetchMasterList(); fetchConstants(); }, []);

  const fetchMasterList = async () => {
    const { data } = await supabase.from('hsk_master_catalog').select('*').order('article_name');
    if (data) setMasterList(data);
  };

  const fetchConstants = async () => {
    const { data } = await supabase.from('hsk_constants').select('*').order('label');
    if (data) setConstants(data);
  };

  const handleEditItem = (item: MasterItem) => {
    setCurrentItem(item);
    setIsEditing(true);
    setIsFormOpen(true);
  };

  const handleAddNew = () => {
    setCurrentItem({ ...defaultItemState, is_minibar_item: activeTab === 'Minibar Menu' });
    setIsEditing(false);
    setIsFormOpen(true);
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
      alert('Upload Error: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveItem = async () => {
    if (!currentItem.article_number || !currentItem.article_name) return alert("Article Number and Name are required.");
    
    // Auto-fill Generic Name if left blank
    const finalData = {
      ...currentItem,
      generic_name: currentItem.generic_name || currentItem.article_name,
      micros_name: currentItem.is_minibar_item && !currentItem.micros_name ? currentItem.article_name : currentItem.micros_name,
    };

    const { error } = await supabase.from('hsk_master_catalog').upsert(finalData, { onConflict: 'article_number' });
    if (error) { alert("Error saving: " + error.message); } 
    else { setIsFormOpen(false); setIsEditing(false); setCurrentItem(defaultItemState); fetchMasterList(); }
  };

  const handleDeleteItem = async (id: string) => {
    if(!confirm("Delete this item?")) return;
    await supabase.from('hsk_master_catalog').delete().eq('article_number', id);
    fetchMasterList();
  };

  const handleAddConstant = async (type: string) => {
    if (!newConstantValue.trim()) return;
    const { error } = await supabase.from('hsk_constants').insert({ type, label: newConstantValue });
    if (!error) { setNewConstantValue(''); fetchConstants(); }
  };

  const handleDeleteConstant = async (id: string) => {
    if (!confirm('Remove?')) return;
    await supabase.from('hsk_constants').delete().eq('id', id);
    fetchConstants();
  };

  const filteredList = masterList.filter(item => 
    item.article_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    item.article_number.includes(searchQuery)
  ).filter(item => {
    if (activeTab === 'Minibar Menu') return item.is_minibar_item;
    if (activeTab === 'Master List') return !item.is_minibar_item;
    if (activeTab === 'Expiry Setup') return item.has_expiry;
    return true;
  });

  const ListManager = ({ type, title, icon: Icon, placeholder }: any) => {
    const list = constants.filter(c => c.type === type);
    return (
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-6">
        <div className="flex items-center gap-2 mb-4 text-[#6D2158]"><Icon size={20} /><h3 className="text-lg font-bold">{title}</h3></div>
        <div className="flex gap-2 mb-4">
          <input type="text" placeholder={placeholder} className="flex-1 p-3 border rounded-xl font-bold text-sm bg-slate-50 outline-none focus:border-[#6D2158]" value={activeConstantType === type ? newConstantValue : ''} onChange={(e) => { setActiveConstantType(type); setNewConstantValue(e.target.value); }}/>
          <button onClick={() => handleAddConstant(type)} className="px-4 py-2 bg-[#6D2158] text-white rounded-xl font-bold uppercase text-xs">Add</button>
        </div>
        <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
           {list.map(item => (
             <div key={item.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg group hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-100 transition-all">
                <span className="font-bold text-slate-600 text-sm">{item.label}</span>
                <button onClick={() => handleDeleteConstant(item.id)} className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={16}/></button>
             </div>
           ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen p-6 pb-20 bg-[#FDFBFD] font-antiqua text-[#6D2158]">
      <div className="border-b border-slate-200 pb-6 mb-6">
        <h1 className="text-3xl font-bold tracking-tight">System Settings</h1>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">Configuration & Master Data</p>
      </div>

      <div className="flex gap-2 mb-8 overflow-x-auto pb-2 no-scrollbar">
         {['Master List', 'Minibar Menu', 'Expiry Setup', 'System Config'].map(tab => (
            <button key={tab} onClick={() => { setActiveTab(tab); setIsFormOpen(false); }} className={`px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all ${activeTab === tab ? 'bg-[#6D2158] text-white shadow-lg shadow-[#6D2158]/20' : 'bg-white text-slate-400 border border-slate-100 hover:border-[#6D2158]'}`}>{tab}</button>
         ))}
      </div>

      {activeTab !== 'System Config' ? (
        <div className="animate-in slide-in-from-right-4 duration-300">
           <div className="flex justify-between items-center mb-6">
              <div className="relative w-full max-w-md">
                 <Search className="absolute left-3 top-3 text-slate-400" size={18}/>
                 <input type="text" placeholder={`Search ${activeTab}...`} className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-[#6D2158]" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}/>
              </div>
              <button onClick={() => isFormOpen ? setIsFormOpen(false) : handleAddNew()} className="ml-4 bg-[#6D2158] text-white px-5 py-3 rounded-xl text-xs font-bold uppercase flex items-center gap-2 shadow-lg whitespace-nowrap transition-all hover:bg-[#5a1b49]">
                 {isFormOpen ? <X size={18}/> : <Plus size={18}/>}
                 {isFormOpen ? 'Close Form' : 'Add Item'}
              </button>
           </div>

           {isFormOpen && (
              <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-100 mb-8 animate-in slide-in-from-top-4">
                 <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-700">
                    {isEditing ? <Edit3 size={20}/> : <Plus size={20}/>}
                    {isEditing ? `Edit: ${currentItem.article_name}` : `New Entry`}
                 </h3>
                 
                 <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                    <div className="md:col-span-3 space-y-4">
                        <div onClick={() => fileInputRef.current?.click()} className={`w-full h-40 bg-slate-50 border-2 border-dashed ${isUploading ? 'border-[#6D2158]' : 'border-slate-200'} rounded-xl flex flex-col items-center justify-center text-slate-400 overflow-hidden relative cursor-pointer hover:border-[#6D2158] transition-all`}>
                            {isUploading ? <Loader2 className="animate-spin text-[#6D2158]" size={32}/> : currentItem.image_url ? <img src={currentItem.image_url} className="w-full h-full object-cover"/> : <><UploadCloud size={32} className="mb-2"/><span className="text-[10px] font-bold uppercase">Upload Image</span></>}
                        </div>
                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload}/>
                    </div>

                    <div className="md:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                           <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Article Number (ID)</label>
                           <input disabled={isEditing} className={`w-full p-3 border rounded-xl font-bold text-slate-700 outline-none focus:border-[#6D2158] ${isEditing ? 'bg-slate-100 text-slate-400' : 'bg-slate-50 border-slate-200'}`} placeholder="151001" value={currentItem.article_number} onChange={e => setCurrentItem({...currentItem, article_number: e.target.value})} />
                        </div>
                        <div>
                           <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Article Name (Official)</label>
                           <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:border-[#6D2158]" placeholder="e.g. Coca Cola Zero 330ml" value={currentItem.article_name} onChange={e => setCurrentItem({...currentItem, article_name: e.target.value})} />
                        </div>
                        <div className="md:col-span-2">
                           <label className="text-[10px] font-black text-[#6D2158] uppercase ml-1">Generic Name (Button Display Name)</label>
                           <input className="w-full p-3 bg-white border-2 border-[#6D2158]/20 rounded-xl font-black text-slate-800 outline-none focus:border-[#6D2158]" placeholder="e.g. Coke Zero" value={currentItem.generic_name} onChange={e => setCurrentItem({...currentItem, generic_name: e.target.value})} />
                        </div>
                        <div>
                           <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Category</label>
                           <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none" value={currentItem.category} onChange={e => setCurrentItem({...currentItem, category: e.target.value})}>
                              {MASTER_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                           </select>
                        </div>
                        <div>
                           <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Unit</label>
                           <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none" value={currentItem.unit} onChange={e => setCurrentItem({...currentItem, unit: e.target.value})}>
                              <option>Each</option><option>Kg</option><option>Ltr</option><option>Box</option>
                           </select>
                        </div>
                        
                        <div className="md:col-span-2 flex gap-6 pt-4 border-t border-slate-100 mt-2">
                           <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${currentItem.is_minibar_item ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'}`} onClick={() => setCurrentItem({...currentItem, is_minibar_item: !currentItem.is_minibar_item})}>
                               <div className={`w-5 h-5 rounded border flex items-center justify-center ${currentItem.is_minibar_item ? 'bg-rose-500 border-rose-500' : 'border-slate-300'}`}>{currentItem.is_minibar_item && <CheckCircle size={14} className="text-white"/>}</div>
                               <span className="text-sm font-bold uppercase">Minibar Item</span>
                           </div>
                           <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${currentItem.has_expiry ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`} onClick={() => setCurrentItem({...currentItem, has_expiry: !currentItem.has_expiry})}>
                               <div className={`w-5 h-5 rounded border flex items-center justify-center ${currentItem.has_expiry ? 'bg-amber-500 border-amber-500' : 'border-slate-300'}`}>{currentItem.has_expiry && <CheckCircle size={14} className="text-white"/>}</div>
                               <span className="text-sm font-bold uppercase">Expiry Tracking</span>
                           </div>
                        </div>

                        {currentItem.is_minibar_item && (
                            <div className="md:col-span-2 p-4 bg-rose-50 rounded-xl border border-rose-100 grid grid-cols-2 gap-4">
                               <div>
                                  <label className="text-[10px] font-bold text-rose-400 uppercase">Micros Name (Billing Name)</label>
                                  <input className="w-full p-3 bg-white border border-rose-200 rounded-xl font-bold text-slate-700 outline-none" value={currentItem.micros_name} onChange={e => setCurrentItem({...currentItem, micros_name: e.target.value})} />
                               </div>
                               <div>
                                  <label className="text-[10px] font-bold text-rose-400 uppercase">Sales Price ($)</label>
                                  <input type="number" className="w-full p-3 bg-white border border-rose-200 rounded-xl font-bold text-slate-700 outline-none" value={currentItem.sales_price} onChange={e => setCurrentItem({...currentItem, sales_price: parseFloat(e.target.value)})} />
                               </div>
                            </div>
                        )}
                    </div>
                 </div>

                 <button onClick={handleSaveItem} disabled={isUploading} className="w-full mt-6 py-4 bg-[#6D2158] text-white rounded-xl font-bold uppercase shadow-lg hover:bg-[#5a1b49] transition-all flex items-center justify-center gap-2">
                    <Save size={18}/> {isEditing ? 'Update Catalog' : 'Save to Catalog'}
                 </button>
              </div>
           )}

           <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <table className="w-full text-left">
                 <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                       <th className="p-4 text-xs font-bold text-slate-400 uppercase w-20">ID</th>
                       <th className="p-4 text-xs font-bold text-slate-400 uppercase">Item Details</th>
                       <th className="p-4 text-xs font-bold text-slate-400 uppercase">Category</th>
                       <th className="p-4 text-xs font-bold text-slate-400 uppercase text-right">Action</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                    {filteredList.map(item => {
                       const Icon = CATEGORY_ICONS[item.category] || Box;
                       return (
                         <tr key={item.article_number} className="hover:bg-slate-50 group">
                            <td className="p-4 text-xs font-bold text-slate-400 font-mono">{item.article_number}</td>
                            <td className="p-4">
                               <div className="flex items-center gap-3">
                                   <div className="w-10 h-10 rounded-lg bg-slate-100 flex-shrink-0 overflow-hidden flex items-center justify-center border border-slate-100">
                                       {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover"/> : <Icon size={18} className="text-slate-400"/>}
                                   </div>
                                   <div>
                                       <div className="font-bold text-slate-700 text-sm">{item.generic_name || item.article_name}</div>
                                       <div className="text-[10px] text-slate-400 uppercase">{item.article_name} • {item.unit}</div>
                                   </div>
                               </div>
                            </td>
                            <td className="p-4 text-xs font-bold text-slate-500">{item.category}</td>
                            <td className="p-4 text-right">
                               <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                   <button onClick={() => handleEditItem(item)} className="p-2 text-blue-400 hover:text-blue-600 rounded-lg transition-colors"><Edit3 size={16}/></button>
                                   <button onClick={() => handleDeleteItem(item.article_number)} className="p-2 text-slate-300 hover:text-rose-500 rounded-lg transition-colors"><Trash2 size={16}/></button>
                               </div>
                            </td>
                         </tr>
                       );
                    })}
                 </tbody>
              </table>
           </div>
        </div>
      ) : (
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in slide-in-from-right-4 duration-300">
            <ListManager type="requester" title="Staff List" icon={Users} placeholder="Add staff name..." />
            <ListManager type="category" title="Categories" icon={Layers} placeholder="Add category..." />
         </div>
      )}
    </div>
  );
}
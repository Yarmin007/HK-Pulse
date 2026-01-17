"use client";
import React, { useState, useEffect } from 'react';
import { 
  Settings, Save, Plus, Trash2, 
  Layers, MapPin, Briefcase, Tag, AlertTriangle
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Constant = {
  id: string;
  type: string;
  label: string;
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('General');
  const [constants, setConstants] = useState<Constant[]>([]);
  const [newItem, setNewItem] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // --- FETCH CONSTANTS ---
  const fetchConstants = async () => {
    setIsLoading(true);
    const { data } = await supabase.from('hsk_constants').select('*').order('label');
    if (data) setConstants(data);
    setIsLoading(false);
  };

  useEffect(() => { fetchConstants(); }, []);

  // --- ACTIONS ---
  const handleAdd = async (type: string) => {
    if (!newItem.trim()) return;
    const { error } = await supabase.from('hsk_constants').insert({ type, label: newItem });
    if (!error) {
      setNewItem('');
      fetchConstants();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure? This might affect items using this value.')) return;
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
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd(type);
            }}
          />
          <button 
            onClick={() => handleAdd(type)}
            className="px-4 py-2 bg-[#6D2158] text-white rounded-xl font-bold uppercase text-xs hover:shadow-lg"
          >
            <Plus size={16}/> Add
          </button>
        </div>

        <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
           {list.map(item => (
             <div key={item.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg group hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-100 transition-all">
                <span className="font-bold text-slate-600 text-sm">{item.label}</span>
                <button onClick={() => handleDelete(item.id)} className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
                   <Trash2 size={16}/>
                </button>
             </div>
           ))}
           {list.length === 0 && <p className="text-xs text-slate-400 italic">No items defined yet.</p>}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen p-6 pb-20 bg-[#FDFBFD] font-antiqua text-[#6D2158]">
      
      {/* HEADER */}
      <div className="border-b border-slate-200 pb-6 mb-6">
        <h1 className="text-3xl font-bold tracking-tight">System Settings</h1>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">
          Configuration & Constants
        </p>
      </div>

      {/* TABS */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
         {['General', 'Inventory Data', 'Zones & Locations'].map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all ${activeTab === tab ? 'bg-[#6D2158] text-white shadow-lg shadow-[#6D2158]/20' : 'bg-white text-slate-400 border border-slate-100 hover:border-[#6D2158]'}`}
            >
              {tab}
            </button>
         ))}
      </div>

      {/* CONTENT */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         
         {activeTab === 'General' && (
           <>
             {/* General App Info */}
             <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 mb-6 text-[#6D2158]">
                   <Settings size={20} />
                   <h3 className="text-lg font-bold">Application Defaults</h3>
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
           </>
         )}

         {activeTab === 'Inventory Data' && (
            <>
               <ListManager type="cost_center" title="Cost Centers" icon={Briefcase} placeholder="e.g. Spa, Front Office..." />
               <ListManager type="category" title="Item Categories" icon={Layers} placeholder="e.g. Cleaning Tools..." />
               <ListManager type="unit" title="Measurement Units" icon={Tag} placeholder="e.g. Pack, Bottle..." />
            </>
         )}

         {activeTab === 'Zones & Locations' && (
            <div className="col-span-1 lg:col-span-2">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <ListManager type="zone" title="Resort Sections / Jetties" icon={MapPin} placeholder="e.g. Water Villa Jetty..." />
                  
                  {/* Future: Room Type Manager could go here */}
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 border-dashed flex flex-col items-center justify-center text-center opacity-70">
                      <MapPin size={32} className="text-slate-300 mb-2"/>
                      <h3 className="font-bold text-slate-500">Room Mapping</h3>
                      <p className="text-xs text-slate-400 mt-1 max-w-xs">Room numbers and types configuration will be available when we build the Housekeeping Operations module.</p>
                  </div>
               </div>
            </div>
         )}

      </div>
    </div>
  );
}
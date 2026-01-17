"use client";
import React, { useState } from 'react';
import { 
  Search, Package, Droplets, Plus, 
  Save, Edit3, ArrowRightLeft, Warehouse, Layers
} from 'lucide-react';

// --- TYPES ---
type InventoryItem = {
  id: number;
  entryDate: string;
  name: string;
  category: string;
  store: 'HK Main Store' | 'HK Chemical Store';
  rack: string;
  level: string;
  stock: number;
  minLevel: number;
  transferIn: number;
  transferOut: number;
  unit: string;
};

// --- MOCK DATA ---
const INITIAL_DATA: InventoryItem[] = [
  { id: 1, entryDate: '2024-01-15', name: "Toilet Paper (3 Ply)", category: "Paper Goods", store: "HK Main Store", rack: "A", level: "1", stock: 145, minLevel: 50, transferIn: 200, transferOut: 55, unit: "Rolls" },
  { id: 2, entryDate: '2024-02-01', name: "Bleach (5L)", category: "Chemicals", store: "HK Chemical Store", rack: "C", level: "3", stock: 12, minLevel: 20, transferIn: 50, transferOut: 38, unit: "Jerry Can" },
  { id: 3, entryDate: '2024-02-10', name: "Glass Cleaner", category: "Chemicals", store: "HK Chemical Store", rack: "C", level: "2", stock: 45, minLevel: 10, transferIn: 60, transferOut: 15, unit: "Bottles" },
  { id: 4, entryDate: '2024-01-20', name: "Guest Shampoo", category: "Amenities", store: "HK Main Store", rack: "B", level: "2", stock: 500, minLevel: 200, transferIn: 1000, transferOut: 500, unit: "Bottles" },
];

export default function StoreInventory() {
  const [activeTab, setActiveTab] = useState<'HK Main Store' | 'HK Chemical Store' | 'Master List'>('HK Main Store');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false); // For Bulk Update
  
  // Data State
  const [inventory, setInventory] = useState(INITIAL_DATA);

  // New Item Form State
  const [newItem, setNewItem] = useState<Partial<InventoryItem>>({
    store: 'HK Main Store',
    entryDate: new Date().toISOString().split('T')[0],
    transferIn: 0,
    transferOut: 0
  });

  // --- FILTER LOGIC ---
  const filteredItems = inventory.filter(item => {
    const matchesTab = activeTab === 'Master List' || item.store === activeTab;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  // --- HANDLERS ---
  const handleAddItem = () => {
    if (!newItem.name || !newItem.stock) return alert("Name and Stock are required");
    const item: InventoryItem = {
      id: Date.now(),
      entryDate: newItem.entryDate!,
      name: newItem.name!,
      category: newItem.category || 'General',
      store: newItem.store as any,
      rack: newItem.rack || '-',
      level: newItem.level || '-',
      stock: Number(newItem.stock),
      minLevel: Number(newItem.minLevel) || 0,
      transferIn: 0,
      transferOut: 0,
      unit: newItem.unit || 'Pcs'
    };
    setInventory([...inventory, item]);
    setIsModalOpen(false);
    setNewItem({ store: 'HK Main Store', entryDate: new Date().toISOString().split('T')[0], transferIn: 0, transferOut: 0 });
  };

  const handleBulkUpdateChange = (id: number, field: string, value: string) => {
    setInventory(inventory.map(item => 
      item.id === id ? { ...item, [field]: Number(value) } : item
    ));
  };

  return (
    <div className="min-h-screen p-6 pb-20 bg-[#FDFBFD] font-antiqua text-[#6D2158]">
      
      {/* --- HEADER --- */}
      <div className="flex flex-col md:flex-row justify-between items-end border-b border-slate-200 pb-6 gap-4">
        <div>
          <h1 className="text-4xl font-bold italic tracking-tight">Store Inventory</h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">
            Warehouse Management
          </p>
        </div>
        <div className="flex gap-3">
            {activeTab === 'Master List' && (
                <button 
                onClick={() => setIsEditMode(!isEditMode)}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg transition-all ${isEditMode ? 'bg-emerald-600 text-white' : 'bg-white text-[#6D2158] border border-[#6D2158]/20'}`}
                >
                {isEditMode ? <><Save size={16}/> Save Changes</> : <><Edit3 size={16}/> Bulk Update</>}
                </button>
            )}
            <button 
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-2 px-6 py-3 bg-[#6D2158] text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg hover:shadow-[#6D2158]/40 hover:-translate-y-1 transition-all"
            >
            <Plus size={16} /> Add Item
            </button>
        </div>
      </div>

      {/* --- CONTROLS --- */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-4 justify-between items-center mt-6">
        
        {/* TABS */}
        <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-200 w-full md:w-auto">
          {['HK Main Store', 'HK Chemical Store', 'Master List'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`px-6 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
                  activeTab === tab ? 'bg-white text-[#6D2158] shadow-sm' : 'text-slate-400 hover:text-[#6D2158]'
                }`}
              >
                {tab === 'HK Main Store' && <Warehouse size={14} />}
                {tab === 'HK Chemical Store' && <Droplets size={14} />}
                {tab === 'Master List' && <Layers size={14} />}
                {tab}
              </button>
          ))}
        </div>

        {/* SEARCH */}
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-2.5 text-slate-300" size={16} />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search article, category..." 
            className="w-full pl-10 pr-4 py-2 text-xs font-bold border border-slate-200 rounded-xl focus:outline-none focus:border-[#6D2158] text-[#6D2158] placeholder-slate-300"
          />
        </div>
      </div>

      {/* --- TABLE --- */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mt-6 overflow-x-auto">
          <table className="w-full text-left min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50/50 text-[9px] uppercase tracking-[0.2em] text-slate-400 font-bold border-b border-slate-100">
                <th className="p-5">Entry Date</th>
                <th className="p-5">Article Name</th>
                <th className="p-5">Store & Loc</th>
                <th className="p-5 text-center">In / Out</th>
                <th className="p-5 text-center">Stock</th>
                <th className="p-5 text-center">Reorder Lvl</th>
                <th className="p-5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredItems.map((item) => {
                const isLow = item.stock <= item.minLevel;
                return (
                  <tr key={item.id} className="hover:bg-[#6D2158]/[0.02] transition-colors">
                    <td className="p-5 text-xs font-bold text-slate-500">{item.entryDate}</td>
                    
                    <td className="p-5">
                      <div className="text-sm font-bold text-[#6D2158]">{item.name}</div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wide">{item.category} • {item.unit}</div>
                    </td>

                    <td className="p-5">
                       <div className="flex flex-col gap-1">
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded w-fit uppercase ${item.store === 'HK Chemical Store' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                             {item.store === 'HK Main Store' ? 'Main' : 'Chem'}
                          </span>
                          <span className="text-[10px] text-slate-500 font-bold">R: {item.rack} / L: {item.level}</span>
                       </div>
                    </td>

                    <td className="p-5 text-center">
                        <div className="flex items-center justify-center gap-3 text-xs font-bold">
                           <span className="text-emerald-600 flex items-center gap-1">+{item.transferIn}</span>
                           <span className="text-rose-400 flex items-center gap-1">-{item.transferOut}</span>
                        </div>
                    </td>

                    <td className="p-5 text-center">
                       {isEditMode && activeTab === 'Master List' ? (
                           <input 
                             type="number" 
                             className="w-20 p-2 border border-[#6D2158]/30 rounded text-center font-bold text-[#6D2158] bg-[#6D2158]/5"
                             value={item.stock}
                             onChange={(e) => handleBulkUpdateChange(item.id, 'stock', e.target.value)}
                           />
                       ) : (
                           <span className={`text-lg font-bold ${isLow ? 'text-rose-600' : 'text-slate-700'}`}>{item.stock}</span>
                       )}
                    </td>

                    <td className="p-5 text-center">
                       {isEditMode && activeTab === 'Master List' ? (
                           <input 
                             type="number" 
                             className="w-16 p-2 border border-slate-200 rounded text-center text-xs font-bold text-slate-500"
                             value={item.minLevel}
                             onChange={(e) => handleBulkUpdateChange(item.id, 'minLevel', e.target.value)}
                           />
                       ) : (
                           <span className="text-xs font-bold text-slate-400">{item.minLevel}</span>
                       )}
                    </td>

                    <td className="p-5 text-right">
                       {isLow ? (
                         <span className="inline-block px-3 py-1 bg-rose-50 text-rose-600 border border-rose-100 rounded-lg text-[9px] font-bold uppercase tracking-wider animate-pulse">Low Stock</span>
                       ) : (
                         <span className="inline-block px-3 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-lg text-[9px] font-bold uppercase tracking-wider">Healthy</span>
                       )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
      </div>

      {/* --- ADD ITEM MODAL --- */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-[#6D2158]/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-white/50 animate-in zoom-in duration-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
               <h3 className="font-bold uppercase tracking-widest text-sm text-[#6D2158]">Add New Inventory</h3>
               <button onClick={() => setIsModalOpen(false)}><ArrowRightLeft size={20} className="rotate-45 text-slate-400 hover:text-rose-500"/></button>
            </div>
            
            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Store Selection */}
                <div className="md:col-span-2">
                   <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-widest">Store Location</label>
                   <div className="flex gap-4">
                      {['HK Main Store', 'HK Chemical Store'].map((s) => (
                        <button 
                          key={s} 
                          onClick={() => setNewItem({...newItem, store: s as any})}
                          className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all ${newItem.store === s ? 'bg-[#6D2158] text-white border-[#6D2158]' : 'bg-white text-slate-400 border-slate-200'}`}
                        >
                          {s}
                        </button>
                      ))}
                   </div>
                </div>

                {/* Details */}
                <div className="space-y-4">
                   <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-widest">Entry Date</label>
                      <input type="date" className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 outline-none focus:border-[#6D2158]" 
                             value={newItem.entryDate} onChange={e => setNewItem({...newItem, entryDate: e.target.value})} />
                   </div>
                   <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-widest">Article Name</label>
                      <input type="text" placeholder="e.g. Bleach 5L" className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 outline-none focus:border-[#6D2158]" 
                             value={newItem.name || ''} onChange={e => setNewItem({...newItem, name: e.target.value})} />
                   </div>
                   <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-widest">Category</label>
                      <input type="text" placeholder="e.g. Cleaning" className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 outline-none focus:border-[#6D2158]" 
                             value={newItem.category || ''} onChange={e => setNewItem({...newItem, category: e.target.value})} />
                   </div>
                </div>

                <div className="space-y-4">
                   <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-widest">Rack No</label>
                        <input type="text" placeholder="A-1" className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 outline-none focus:border-[#6D2158]" 
                               value={newItem.rack || ''} onChange={e => setNewItem({...newItem, rack: e.target.value})} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-widest">Level No</label>
                        <input type="text" placeholder="2" className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 outline-none focus:border-[#6D2158]" 
                               value={newItem.level || ''} onChange={e => setNewItem({...newItem, level: e.target.value})} />
                      </div>
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-widest">Stock In Hand</label>
                        <input type="number" placeholder="0" className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 outline-none focus:border-[#6D2158]" 
                               value={newItem.stock || ''} onChange={e => setNewItem({...newItem, stock: Number(e.target.value)})} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-widest">Reorder Lvl</label>
                        <input type="number" placeholder="10" className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 outline-none focus:border-[#6D2158]" 
                               value={newItem.minLevel || ''} onChange={e => setNewItem({...newItem, minLevel: Number(e.target.value)})} />
                      </div>
                   </div>
                </div>

                <button onClick={handleAddItem} className="md:col-span-2 w-full py-4 bg-[#6D2158] text-white rounded-xl font-bold uppercase tracking-widest shadow-lg hover:shadow-[#6D2158]/40 mt-2">
                   Save Inventory
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
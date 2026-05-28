"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { 
  RefreshCw, Layers, ClipboardList, CheckCircle2, AlertTriangle, 
  ArrowLeftRight, Settings, History, HelpCircle, Truck, Package, Box, Search, Save, Trash2
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

type TabType = 'VILLAS' | 'DISPATCH_QUEUE' | 'TIMELINE' | 'CONFIG';

export default function MinibarLiveTrackingPage() {
  const [activeTab, setActiveTab] = useState<TabType>('VILLAS');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Core Mock States for System Simulation
  const [villas, setVillas] = useState<any[]>([
    { villa: '101', status: 'AWAITING_DISPATCH', items: [{ name: 'Coke', par: 2, current: 1, missing: 1, date: '12th April', loggedBy: 'Ali Maah' }], profile: 'FULL' },
    { villa: '102', status: 'OK', items: [{ name: 'Coke', par: 2, current: 2, missing: 0, date: '', loggedBy: '' }], profile: 'NO_ALCOHOL' },
    { villa: '105', status: 'AWAITING_REFILL', items: [{ name: 'Heineken Beer', par: 2, current: 0, missing: 2, date: '11th April', loggedBy: 'Mohamed Aboobakuru' }], profile: 'FULL' },
    { villa: '108', status: 'SHORT_STOCK', items: [{ name: 'Pringles', par: 1, current: 0, missing: 1, date: '13th April', loggedBy: 'Ali Maah', note: 'Store short stock' }], profile: 'CUSTOM' }
  ]);

  const [dispatches, setDispatches] = useState<any[]>([
    { id: '1', villa: '101', item: 'Coke', qty: 1, postedBy: 'Ali Maah', date: '12th April', status: 'PENDING_DISPATCH', comment: '' },
    { id: '2', villa: '105', item: 'Heineken Beer', qty: 2, postedBy: 'Mohamed Aboobakuru', date: '11th April', status: 'DISPATCHED', comment: 'Released from store' }
  ]);

  const [logs, setLogs] = useState<any[]>([
    { id: '1', villa: '101', date: '2026-04-12 10:15', msg: '1 Coke consumed and posted by Ali Maah. Not refilled. Awaiting Dispatch.' },
    { id: '2', villa: '105', date: '2026-04-11 14:20', msg: '2 Heineken Beer dispatched by Admin. Stock removed from Main Store. Awaiting Refill.' }
  ]);

  // Modals Controller States
  const [transferModal, setTransferModal] = useState({ isOpen: false, fromVilla: '', toVilla: '', item: '', qty: 1 });
  const [selectedVilla, setSelectedVilla] = useState<any | null>(null);

  // Filter View Calculation Matrix
  const filteredVillas = useMemo(() => {
    return villas.filter(v => 
      v.villa.includes(searchQuery) || 
      v.status.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.profile.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [villas, searchQuery]);

  const handleAdminDispatch = (id: string, note?: string) => {
    setDispatches(prev => prev.map(d => {
      if (d.id === id) {
        return { ...d, status: 'DISPATCHED', comment: note || 'Dispatched to Runner Caddy' };
      }
      return d;
    }));
    
    const target = dispatches.find(d => d.id === id);
    if (target) {
      // Update parent status matrix instantly
      setVillas(prev => prev.map(v => v.villa === target.villa ? { ...v, status: 'AWAITING_REFILL' } : v));
      setLogs(prev => [
        { id: String(Date.now()), date: '2026-04-13 09:00', msg: `${target.qty} ${target.item} for V${target.villa} dispatched from Main Store. Comment: ${note || 'None'}` },
        ...prev
      ]);
      toast.success(`Dispatched successfully! Removed from Minibar Store.`);
    }
  };

  const handleShortStockNote = (id: string, note: string) => {
    setDispatches(prev => prev.map(d => d.id === id ? { ...d, comment: note } : d));
    const target = dispatches.find(d => d.id === id);
    if (target) {
      setVillas(prev => prev.map(v => v.villa === target.villa ? { ...v, status: 'SHORT_STOCK' } : v));
      toast.error("Short stock notice broadcasted to attendants.");
    }
  };

  const handleCompleteRefill = (villaNum: string, itemName: string) => {
    setVillas(prev => prev.map(v => {
      if (v.villa === villaNum) {
        return { ...v, status: 'OK', items: v.items.map((i: any) => i.name === itemName ? { ...i, current: i.par, missing: 0 } : i) };
      }
      return v;
    }));
    setDispatches(prev => prev.filter(d => !(d.villa === villaNum && d.item === itemName)));
    setLogs(prev => [
      { id: String(Date.now()), date: '2026-04-13 11:30', msg: `${itemName} completely refilled at V${villaNum} by Attendant.` },
      ...prev
    ]);
    toast.success("Refill confirmed! Villa reset to fully stocked status.");
    setSelectedVilla(null);
  };

  const handleVillaTransfer = () => {
    const { fromVilla, toVilla, item, qty } = transferModal;
    if (!fromVilla || !toVilla || !item || qty <= 0) {
      toast.error("Please insert valid transfer credentials.");
      return;
    }

    setVillas(prev => prev.map(v => {
      if (v.villa === fromVilla) {
        return { ...v, items: v.items.map((i: any) => i.name === item ? { ...i, current: Math.max(0, i.current - qty) } : i) };
      }
      if (v.villa === toVilla) {
        return { ...v, items: v.items.map((i: any) => i.name === item ? { ...i, current: i.current + qty } : i) };
      }
      return v;
    }));

    setLogs(prev => [
      { id: String(Date.now()), date: '2026-04-13 12:00', msg: `Inter-Villa Transfer: Moved ${qty} ${item} directly from V${fromVilla} to V${toVilla}.` },
      ...prev
    ]);

    setTransferModal({ isOpen: false, fromVilla: '', toVilla: '', item: '', qty: 1 });
    toast.success(`Successfully transferred inventory from V${fromVilla} to V${toVilla}.`);
  };

  const updateProfileType = (villaNum: string, type: 'FULL' | 'NO_ALCOHOL' | 'REMOVED' | 'CUSTOM') => {
    setVillas(prev => prev.map(v => v.villa === villaNum ? { ...v, profile: type } : v));
    setLogs(prev => [
      { id: String(Date.now()), date: '2026-04-13 12:15', msg: `Layout settings modified for V${villaNum}: Profile updated to ${type}.` },
      ...prev
    ]);
    toast.success(`Profile updated to ${type}`);
  };

  return (
    <div className="absolute inset-0 md:left-64 pt-16 md:pt-0 flex flex-col bg-[#FDFBFD] font-sans text-slate-800 overflow-hidden">
      
      {/* HEADER BAR ROW */}
      <div className="flex-none flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-200 p-4 md:p-6 bg-white shadow-sm gap-4 z-10">
        <div>
          <h1 className="text-xl md:text-2xl font-black tracking-tight text-[#6D2158] flex items-center gap-2">
            <Package /> Minibar Live Tracking Hub
          </h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
            Real-Time Operational Inventory Management Matrix
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input 
            type="text" 
            placeholder="Search villa, profile, status..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-[#6D2158] focus:bg-white transition-all"
          />
        </div>
      </div>

      {/* CORE CONTROL TABS ROW */}
      <div className="flex-none flex gap-2 border-b border-slate-200 bg-white px-4 md:px-6 py-2">
        {(['VILLAS', 'DISPATCH_QUEUE', 'TIMELINE', 'CONFIG'] as TabType[]).map((tab) => {
          const tabLabels: Record<TabType, string> = { 
            VILLAS: 'Live Villa Views', 
            DISPATCH_QUEUE: 'Admins Dispatch Grid', 
            TIMELINE: 'Audit Activity Logs', 
            CONFIG: 'Profiles Override' 
          };
          const icons: Record<TabType, any> = { VILLAS: Box, DISPATCH_QUEUE: Truck, TIMELINE: History, CONFIG: Settings };
          const CurrentIcon = icons[tab];
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-2 px-4 py-2 font-black text-xs uppercase tracking-wider rounded-xl transition-all ${activeTab === tab ? 'bg-[#6D2158] text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <CurrentIcon size={14} /> {tabLabels[tab]}
            </button>
          );
        })}
      </div>

      {/* MAIN VIEWPORT PANELS CONTAINER */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar space-y-6">
        
        {/* TAB 1: LIVE VILLA STOCK VIEWS */}
        {activeTab === 'VILLAS' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            
            {/* LEFT GRID LISTING */}
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredVillas.map(v => (
                <div 
                  key={v.villa}
                  onClick={() => setSelectedVilla(v)}
                  className={`bg-white p-5 rounded-2xl border-2 transition-all cursor-pointer shadow-sm relative overflow-hidden group ${selectedVilla?.villa === v.villa ? 'border-[#6D2158] ring-2 ring-[#6D2158]/10' : 'border-slate-100 hover:border-slate-300'}`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <span className="text-2xl font-black tracking-tight text-slate-800">Villa {v.villa}</span>
                      <span className="text-[9px] font-bold uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded-md text-slate-500 ml-2">{v.profile}</span>
                    </div>
                    <span className={`px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-wider border shadow-sm ${
                      v.status === 'OK' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                      v.status === 'AWAITING_DISPATCH' ? 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse' :
                      v.status === 'SHORT_STOCK' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-blue-50 text-blue-700 border-blue-100'
                    }`}>
                      {v.status.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="space-y-1">
                    {v.items.map((item: any, i: number) => (
                      <div key={i} className="flex justify-between text-xs font-bold text-slate-600">
                        <span>{item.name}</span>
                        <span className="font-mono">{item.current} / {item.par} Par</span>
                      </div>
                    ))}
                  </div>

                  {v.status !== 'OK' && (
                    <div className="mt-3 pt-2.5 border-t border-dashed border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-bold">
                      <span className="truncate">Alert: {v.items[0]?.date} by {v.items[0]?.loggedBy}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* RIGHT CONTEXT INSPECTION COLUMN */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-md sticky top-0 space-y-4">
              {selectedVilla ? (
                <>
                  <div className="border-b pb-3 flex justify-between items-center">
                    <div>
                      <h3 className="text-lg font-black text-slate-800">Villa {selectedVilla.villa} Status Dossier</h3>
                      <p className="text-[10px] uppercase font-black text-purple-600">Active Profile: {selectedVilla.profile}</p>
                    </div>
                    <button 
                      onClick={() => setTransferModal(p => ({ ...p, isOpen: true, fromVilla: selectedVilla.villa }))}
                      className="p-2 bg-purple-50 text-[#6D2158] border border-purple-200 rounded-xl hover:bg-purple-100 font-bold text-xs flex items-center gap-1.5"
                    >
                      <ArrowLeftRight size={14}/> Transfer
                    </button>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Physical Stock Blueprint</h4>
                    {selectedVilla.items.map((item: any, i: number) => (
                      <div key={i} className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-2">
                        <div className="flex justify-between items-center text-xs font-bold">
                          <span className="text-slate-800">{item.name}</span>
                          <span className="font-mono text-[#6D2158]">{item.current} Loaded / {item.par} Par</span>
                        </div>
                        {item.missing > 0 && (
                          <div className="p-2 bg-amber-50/60 border border-amber-100 rounded-lg space-y-1">
                            <p className="text-[11px] text-amber-800 font-bold flex items-center gap-1">
                              <AlertTriangle size={12}/> {item.missing} Un-refilled item logged
                            </p>
                            <p className="text-[9px] text-slate-400 font-medium">Logged on {item.date} by {item.loggedBy}</p>
                            
                            {selectedVilla.status === 'AWAITING_REFILL' && (
                              <button 
                                onClick={() => handleCompleteRefill(selectedVilla.villa, item.name)}
                                className="mt-2 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase py-1.5 rounded-lg tracking-wider"
                              >
                                Complete Physical Refill
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-20 text-slate-300 flex flex-col items-center justify-center">
                  <ClipboardList size={48} className="opacity-30 mb-2" />
                  <p className="text-sm font-bold">Select any room card to open internal live trails and quick action commands.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: ADMINS CENTRAL STORE DISPATCH GRID */}
        {activeTab === 'DISPATCH_QUEUE' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50/50 border-b border-slate-200">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-2">
                <Truck size={16} className="text-[#6D2158]"/> Storekeeper Authorization & Dispatch Buffer Pipeline
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                    <th className="p-4">Target Room</th>
                    <th className="p-4">Requested Material</th>
                    <th className="p-4 text-center">Qty</th>
                    <th className="p-4">Consumption Reporter</th>
                    <th className="p-4">Pipeline Status</th>
                    <th className="p-4">Internal Store Comment</th>
                    <th className="p-4 text-right">Action Logs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                  {dispatches.map(d => (
                    <tr key={d.id} className="hover:bg-slate-50/40">
                      <td className="p-4 font-black text-sm text-slate-800">Villa {d.villa}</td>
                      <td className="p-4">{d.item}</td>
                      <td className="p-4 text-center font-mono text-purple-700 text-sm">{d.qty}</td>
                      <td className="p-4 font-normal text-slate-500">
                        <div>{d.postedBy}</div>
                        <div className="text-[9px] tracking-wider text-slate-400 uppercase">{d.date}</div>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-black tracking-wide ${
                          d.status === 'PENDING_DISPATCH' ? 'bg-amber-100 text-amber-700 border border-amber-200 animate-pulse' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {d.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="p-4 text-xs font-medium italic text-slate-400 max-w-xs truncate">
                        {d.comment || <span className="opacity-40 font-sans">No remarks inserted...</span>}
                      </td>
                      <td className="p-4 text-right space-x-2">
                        {d.status === 'PENDING_DISPATCH' ? (
                          <>
                            <button 
                              onClick={() => {
                                const note = prompt("Insert comment override (Optional):");
                                if (note !== null) handleShortStockNote(d.id, note);
                              }}
                              className="text-[10px] uppercase font-black tracking-wider px-2.5 py-1.5 border border-rose-200 bg-rose-50 text-rose-700 rounded-lg hover:bg-rose-100"
                            >
                              Short Stock
                            </button>
                            <button 
                              onClick={() => handleAdminDispatch(d.id)}
                              className="text-[10px] uppercase font-black tracking-wider px-3 py-1.5 bg-[#6D2158] text-white rounded-lg hover:bg-[#521942] shadow-sm"
                            >
                              Release & Dispatch
                            </button>
                          </>
                        ) : (
                          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-sans flex items-center justify-end gap-1">
                            <CheckCircle2 size={12} className="text-emerald-600"/> Released From Store
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: IMMUTABLE AUDIT TIMELINE LOGS */}
        {activeTab === 'TIMELINE' && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2 border-b pb-3">
              <History size={16} className="text-[#6D2158]"/> Live Activity Execution Audit Log Trails
            </h3>
            <div className="relative border-l-2 border-slate-100 pl-4 space-y-6 py-2">
              {logs.map(log => (
                <div key={log.id} className="relative group">
                  <div className="absolute left-[-21px] top-0.5 bg-white border-2 border-[#6D2158] w-2.5 h-2.5 rounded-full shadow-sm group-hover:bg-purple-600 transition-colors"></div>
                  <div className="text-[10px] font-mono font-black text-[#6D2158] tracking-widest">{log.date}</div>
                  <p className="text-xs font-bold text-slate-700 mt-1">{log.msg}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: VILLA CUSTOM PROFILES CONFIGURATION OVERRIDES */}
        {activeTab === 'CONFIG' && (
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="border-b pb-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-700 flex items-center gap-2">
                <Settings size={16} className="text-[#6D2158]"/> Bulk Layout & Profiles Structure Configurations Overrides
              </h3>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">Control layout types inside rooms instantly to filter par configuration calculations</p>
            </div>

            <div className="divide-y divide-slate-100">
              {villas.map(v => (
                <div key={v.villa} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-bold">
                  <div>
                    <span className="text-sm text-slate-800 font-black">Villa {v.villa} Layout Setup</span>
                    <p className="text-[10px] text-slate-400 font-normal">Active par profiles rule tracking metrics</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {['FULL', 'NO_ALCOHOL', 'REMOVED', 'CUSTOM'].map((type: any) => {
                      const typeLabels: any = { FULL: 'Standard Full', NO_ALCOHOL: 'Alcohol-Free', REMOVED: 'Fully Empty', CUSTOM: 'Custom Mix' };
                      return (
                        <button
                          key={type}
                          onClick={() => updateProfileType(v.villa, type)}
                          className={`text-[10px] font-black uppercase px-3 py-1.5 rounded-xl border tracking-wide transition-all ${
                            v.profile === type 
                              ? 'bg-purple-50 text-[#6D2158] border-[#6D2158] shadow-sm' 
                              : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {typeLabels[type]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* --- FLOATING MODAL WIDGET: INTER-VILLA TRANSFER PLATFORM --- */}
      {transferModal.isOpen && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 p-6 space-y-4">
            <div className="border-b pb-2 flex justify-between items-center">
              <h3 className="font-black text-lg text-slate-800 flex items-center gap-2 tracking-tight">
                <ArrowLeftRight className="text-[#6D2158]"/> Inter-Villa Inventory Transfer
              </h3>
              <button 
                onClick={() => setTransferModal(p => ({ ...p, isOpen: false }))}
                className="text-xs uppercase text-slate-400 font-black tracking-widest hover:text-slate-600"
              >
                Cancel
              </button>
            </div>

            <div className="space-y-3 text-xs font-bold text-slate-600">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Source Villa</label>
                <input 
                  type="text" value={transferModal.fromVilla}
                  onChange={e => setTransferModal(p => ({ ...p, fromVilla: e.target.value }))}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Destination Target Villa</label>
                <input 
                  type="text" placeholder="e.g. 102" value={transferModal.toVilla}
                  onChange={e => setTransferModal(p => ({ ...p, toVilla: e.target.value }))}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Select Article Item</label>
                <select 
                  value={transferModal.item}
                  onChange={e => setTransferModal(p => ({ ...p, item: e.target.value }))}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold cursor-pointer"
                >
                  <option value="">-- Choose Item --</option>
                  <option value="Coke">Coke</option>
                  <option value="Heineken Beer">Heineken Beer</option>
                  <option value="Pringles">Pringles</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Quantity (Qty)</label>
                <input 
                  type="number" min="1" value={transferModal.qty}
                  onChange={e => setTransferModal(p => ({ ...p, qty: parseInt(e.target.value) || 1 }))}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono font-bold"
                />
              </div>
            </div>

            <button 
              onClick={handleVillaTransfer}
              className="w-full bg-[#6D2158] hover:bg-[#511942] text-white font-black uppercase text-xs py-3 rounded-xl tracking-wider shadow-md transition-colors"
            >
              Authorize & Transfer Balance
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
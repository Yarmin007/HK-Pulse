"use client";
import React, { useState, useEffect } from 'react';
import { 
  Search, Plus, PackageCheck, Truck, Warehouse,
  X, Pencil, Trash2, MapPin, Save, AlertCircle
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// --- TYPES ---
type OrderRecord = {
  id: string;
  order_type: 'Purchase Request' | 'Store Request';
  request_date: string;
  request_no: string;
  article_number: string;
  item_name: string;
  ordered_qty: number;
  unit: string;
  received_date: string | null;
  received_qty: number;
  status: string;
};

// --- CONFIG ---
const STORES = ["Minibar Store", "HSK Main Store", "Chemical Store", "Laundry Chemical Store"];
const STORES_WITH_LEVELS = ["HSK Main Store", "Chemical Store"];

export default function OrderTrackingPage() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'Purchase Request' | 'Store Request'>('Purchase Request');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Modals & Forms
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  
  // Data State
  const [formData, setFormData] = useState({
    request_date: new Date().toISOString().split('T')[0],
    request_no: '',
    article_number: '',
    item_name: '',
    ordered_qty: '',
    unit: 'Each'
  });

  const [receiveData, setReceiveData] = useState({
    received_date: new Date().toISOString().split('T')[0],
    received_qty: '',
    target_store: 'HSK Main Store',
    target_level: ''
  });

  useEffect(() => { fetchOrders(); }, [activeTab]);

  const fetchOrders = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from('hsk_procurement_orders')
      .select('*')
      .eq('order_type', activeTab)
      .order('request_date', { ascending: false });
    
    if (data) setOrders(data);
    setIsLoading(false);
  };

  // --- NEW: MASTER LIST LOOKUP ---
  const lookupArticle = async (val: string) => {
    if(!val) return;
    
    // 1. Try to find by Article Number in Master Catalog
    let { data } = await supabase
      .from('hsk_master_catalog')
      .select('article_number, article_name, unit')
      .eq('article_number', val)
      .single();
    
    // 2. If not found, try by Exact Name
    if (!data) {
       const res = await supabase
         .from('hsk_master_catalog')
         .select('article_number, article_name, unit')
         .ilike('article_name', val)
         .limit(1);
       if (res.data && res.data.length > 0) data = res.data[0];
    }

    // 3. Auto-fill if found
    if (data) {
       setFormData(prev => ({
         ...prev,
         article_number: data.article_number,
         item_name: data.article_name,
         unit: data.unit || 'Each'
       }));
    }
  };

  const handleSaveOrder = async () => {
    // Validation: Must have Article Number
    if (!formData.article_number || !formData.item_name) {
        return alert("Please select a valid item from the Master Catalog. Type Article No or Name to search.");
    }

    const { error } = await supabase.from('hsk_procurement_orders').insert({
      order_type: activeTab,
      request_date: formData.request_date,
      request_no: formData.request_no,
      article_number: formData.article_number,
      item_name: formData.item_name,
      ordered_qty: parseFloat(formData.ordered_qty),
      unit: formData.unit,
      received_qty: 0,
      status: 'Pending'
    });

    if (!error) {
      setIsAddOpen(false);
      fetchOrders();
      // Reset form
      setFormData({ 
        request_date: new Date().toISOString().split('T')[0], 
        request_no: '', article_number: '', item_name: '', ordered_qty: '', unit: 'Each' 
      });
    } else {
        alert("Error: " + error.message);
    }
  };

  const handleDelete = async (id: string) => {
    if(!confirm("Delete this order?")) return;
    await supabase.from('hsk_procurement_orders').delete().eq('id', id);
    fetchOrders();
  };

  const handleReceiveOrder = async () => {
    if (!selectedOrder) return;
    
    const qtyNow = parseFloat(receiveData.received_qty);
    const totalReceived = (selectedOrder.received_qty || 0) + qtyNow;
    
    // 1. Update Order Status
    let newStatus = 'Pending';
    if (totalReceived >= selectedOrder.ordered_qty) newStatus = 'Completed';
    else if (totalReceived > 0) newStatus = 'Partial';

    await supabase.from('hsk_procurement_orders').update({
      received_date: receiveData.received_date,
      received_qty: totalReceived,
      status: newStatus
    }).eq('id', selectedOrder.id);

    // 2. Update Inventory Stock (Using Article Number)
    // Check if item exists in this specific store location
    const { data: existingInv } = await supabase.from('hsk_inventory')
      .select('*')
      .eq('article_number', selectedOrder.article_number)
      .eq('location', receiveData.target_store)
      .eq('level', receiveData.target_level || '') // Handle optional level
      .single();

    if (existingInv) {
      // Add to existing stock
      await supabase.from('hsk_inventory').update({ 
          qty_on_hand: existingInv.qty_on_hand + qtyNow,
          updated_at: new Date().toISOString()
      }).eq('id', existingInv.id);
    } else {
      // Create new stock record for this location
      await supabase.from('hsk_inventory').insert({
        article_number: selectedOrder.article_number,
        location: receiveData.target_store,
        level: receiveData.target_level || '',
        qty_on_hand: qtyNow,
        unit: selectedOrder.unit
      });
    }

    setIsReceiveOpen(false);
    setSelectedOrder(null);
    fetchOrders();
    alert(`Stock updated in ${receiveData.target_store}.`);
  };

  const filteredOrders = orders.filter(o => 
    o.item_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    o.request_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (o.article_number && o.article_number.includes(searchQuery))
  );

  return (
    <div className="min-h-screen bg-[#FDFBFD] p-6 pb-24 font-antiqua text-[#6D2158]">
      
      {/* HEADER */}
      <div className="flex justify-between items-end mb-6 border-b border-slate-200 pb-6">
        <div>
           <h1 className="text-3xl font-bold tracking-tight">Order Tracking</h1>
           <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">
             Procurement & Receiving
           </p>
        </div>
        <button onClick={() => setIsAddOpen(true)} className="bg-[#6D2158] text-white px-5 py-3 rounded-xl text-xs font-bold uppercase flex items-center gap-2 shadow-lg hover:bg-[#5a1b49] transition-all">
          <Plus size={18}/> New Order
        </button>
      </div>

      {/* TABS */}
      <div className="flex gap-4 mb-6">
        <button 
          onClick={() => setActiveTab('Purchase Request')}
          className={`flex-1 p-4 rounded-xl border-2 flex items-center justify-center gap-3 transition-all ${activeTab === 'Purchase Request' ? 'border-[#6D2158] bg-white text-[#6D2158] shadow-md' : 'border-transparent bg-slate-100 text-slate-400'}`}
        >
          <Truck size={24} />
          <div className="text-left">
            <span className="block text-xs font-bold uppercase">External</span>
            <span className="text-lg font-bold">Purchase Request</span>
          </div>
        </button>

        <button 
          onClick={() => setActiveTab('Store Request')}
          className={`flex-1 p-4 rounded-xl border-2 flex items-center justify-center gap-3 transition-all ${activeTab === 'Store Request' ? 'border-[#6D2158] bg-white text-[#6D2158] shadow-md' : 'border-transparent bg-slate-100 text-slate-400'}`}
        >
          <Warehouse size={24} />
          <div className="text-left">
            <span className="block text-xs font-bold uppercase">Internal</span>
            <span className="text-lg font-bold">Store Request</span>
          </div>
        </button>
      </div>

      {/* SEARCH */}
      <div className="relative mb-6">
         <Search className="absolute left-4 top-3.5 text-slate-400" size={18}/>
         <input 
            type="text" 
            placeholder="Search by Request No, Article No, or Name..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-sm text-slate-700 outline-none focus:border-[#6D2158]"
         />
      </div>

      {/* ORDERS TABLE */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-left">
           <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                 <th className="p-4 text-xs font-bold text-slate-400 uppercase">Req No</th>
                 <th className="p-4 text-xs font-bold text-slate-400 uppercase">Art. No</th>
                 <th className="p-4 text-xs font-bold text-slate-400 uppercase">Item Description</th>
                 <th className="p-4 text-xs font-bold text-slate-400 uppercase text-center">Ordered</th>
                 <th className="p-4 text-xs font-bold text-slate-400 uppercase text-center">Received</th>
                 <th className="p-4 text-xs font-bold text-slate-400 uppercase text-center">Status</th>
                 <th className="p-4 text-xs font-bold text-slate-400 uppercase text-right">Action</th>
              </tr>
           </thead>
           <tbody className="divide-y divide-slate-50">
              {filteredOrders.map(order => (
                 <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 text-sm font-bold text-[#6D2158]">{order.request_no}</td>
                    <td className="p-4 text-xs font-bold text-slate-400 font-mono">{order.article_number}</td>
                    <td className="p-4 text-sm font-bold text-slate-700">{order.item_name}</td>
                    <td className="p-4 text-sm font-bold text-slate-700 text-center">{order.ordered_qty} <span className="text-[10px] text-slate-400 uppercase">{order.unit}</span></td>
                    <td className="p-4 text-sm font-bold text-emerald-600 text-center">{order.received_qty > 0 ? order.received_qty : '-'}</td>
                    <td className="p-4 text-center">
                       <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${
                          order.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' :
                          order.status === 'Partial' ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-500'
                       }`}>
                          {order.status}
                       </span>
                    </td>
                    <td className="p-4 text-right flex items-center justify-end gap-2">
                       {order.status !== 'Completed' && (
                         <button 
                           onClick={() => { setSelectedOrder(order); setIsReceiveOpen(true); }}
                           className="bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-lg text-xs font-bold uppercase hover:bg-emerald-600 hover:text-white transition-colors flex items-center gap-1"
                         >
                           <PackageCheck size={14}/> Recv
                         </button>
                       )}
                       <button onClick={() => handleDelete(order.id)} className="text-slate-300 hover:text-rose-500"><Trash2 size={16}/></button>
                    </td>
                 </tr>
              ))}
           </tbody>
        </table>
        </div>
      </div>

      {/* --- ADD MODAL --- */}
      {isAddOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 animate-in slide-in-from-bottom-8">
             <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-700">New {activeTab}</h3>
                <button onClick={() => setIsAddOpen(false)}><X className="text-slate-400"/></button>
             </div>
             
             <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                   <div>
                      <label className="text-xs font-bold text-slate-400 uppercase">Date</label>
                      <input type="date" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none" value={formData.request_date} onChange={e => setFormData({...formData, request_date: e.target.value})} />
                   </div>
                   <div>
                      <label className="text-xs font-bold text-slate-400 uppercase">Req No</label>
                      <input type="text" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:border-[#6D2158]" value={formData.request_no} onChange={e => setFormData({...formData, request_no: e.target.value})} />
                   </div>
                </div>
                
                {/* MASTER LIST LOOKUP */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-1">
                      <label className="text-xs font-bold text-slate-400 uppercase">Article No</label>
                      <input 
                        type="text" 
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:border-[#6D2158]" 
                        placeholder="Scan/Type" 
                        value={formData.article_number} 
                        onChange={e => setFormData({...formData, article_number: e.target.value})} 
                        onBlur={(e) => lookupArticle(e.target.value)}
                      />
                  </div>
                  <div className="col-span-2">
                      <label className="text-xs font-bold text-slate-400 uppercase">Item Name</label>
                      <input type="text" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:border-[#6D2158]" placeholder="Auto-filled from Master" value={formData.item_name} readOnly />
                  </div>
                </div>

                {!formData.item_name && formData.article_number && (
                   <p className="text-[10px] text-rose-500 font-bold flex items-center gap-1"><AlertCircle size={12}/> Item not found in Master Catalog. Please add it in Settings first.</p>
                )}

                <div className="grid grid-cols-2 gap-4">
                   <div>
                      <label className="text-xs font-bold text-slate-400 uppercase">Ordered Qty</label>
                      <input type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:border-[#6D2158]" value={formData.ordered_qty} onChange={e => setFormData({...formData, ordered_qty: e.target.value})} />
                   </div>
                   <div>
                      <label className="text-xs font-bold text-slate-400 uppercase">Unit</label>
                      <input type="text" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none bg-slate-50" value={formData.unit} readOnly />
                   </div>
                </div>

                <button onClick={handleSaveOrder} className="w-full py-3 bg-[#6D2158] text-white rounded-xl font-bold uppercase shadow-lg mt-4 flex items-center justify-center gap-2">
                    <Save size={18}/> Create Order
                </button>
             </div>
          </div>
        </div>
      )}

      {/* --- RECEIVE MODAL --- */}
      {isReceiveOpen && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95">
             <div className="mb-4">
                <h3 className="text-lg font-bold text-slate-700">Receive Goods</h3>
                <p className="text-sm text-slate-500 font-bold">{selectedOrder.item_name}</p>
                <p className="text-xs text-slate-400 font-mono mt-1">Ref: {selectedOrder.article_number}</p>
             </div>
             
             <div className="space-y-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex justify-between items-center">
                   <div>
                      <span className="block text-[10px] font-bold text-slate-400 uppercase">Ordered</span>
                      <span className="text-xl font-bold text-slate-800">{selectedOrder.ordered_qty}</span>
                   </div>
                   <div className="h-full w-px bg-slate-200 mx-4"></div>
                   <div>
                      <span className="block text-[10px] font-bold text-slate-400 uppercase">Received</span>
                      <span className="text-xl font-bold text-emerald-600">{selectedOrder.received_qty}</span>
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                       <label className="text-xs font-bold text-slate-400 uppercase">Received Date</label>
                       <input type="date" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none" value={receiveData.received_date} onChange={e => setReceiveData({...receiveData, received_date: e.target.value})} />
                    </div>
                    <div>
                       <label className="text-xs font-bold text-slate-400 uppercase">Qty Recv Now</label>
                       <input type="number" autoFocus className="w-full p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl font-bold outline-none focus:border-emerald-500" value={receiveData.received_qty} onChange={e => setReceiveData({...receiveData, received_qty: e.target.value})} />
                    </div>
                </div>

                <div className="border-t border-slate-100 pt-4 mt-2">
                    <p className="text-xs font-bold text-[#6D2158] uppercase mb-2 flex items-center gap-1"><MapPin size={12}/> Put Away Location</p>
                    <div className="space-y-3">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Store</label>
                            <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none" value={receiveData.target_store} onChange={e => setReceiveData({...receiveData, target_store: e.target.value, target_level: ''})}>
                                {STORES.map(s => <option key={s}>{s}</option>)}
                            </select>
                        </div>
                        {STORES_WITH_LEVELS.includes(receiveData.target_store) && (
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Shelf / Level</label>
                                <input type="text" placeholder="e.g. Level 1, Shelf A" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none" value={receiveData.target_level} onChange={e => setReceiveData({...receiveData, target_level: e.target.value})} />
                            </div>
                        )}
                    </div>
                </div>

                <button onClick={handleReceiveOrder} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold uppercase shadow-lg mt-2">Confirm & Add to Stock</button>
                <button onClick={() => setIsReceiveOpen(false)} className="w-full py-3 text-slate-400 font-bold text-xs uppercase hover:text-slate-600">Cancel</button>
             </div>
          </div>
        </div>
      )}

    </div>
  );
}
"use client";
import React, { useState, useEffect } from 'react';
import { 
  Plus, Truck, CheckCircle2, Clock, X, Store, ArrowDownToLine, 
  ShoppingCart, FileText
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// --- TYPES ---
type MasterItem = {
  id: string;
  article_number: string;
  item_name: string;
  unit: string;
};

type OrderItem = {
  id?: string;
  master_id: string;
  quantity: number;
  master?: MasterItem; 
};

type Order = {
  id: string;
  po_number: string;
  order_type: 'Purchase Request' | 'Store Request';
  cost_center: 'Housekeeping' | 'Minibar' | 'Garden' | 'Laundry';
  source_name: string;
  status: 'Pending' | 'Received';
  request_date: string;
  received_date?: string;
  items?: OrderItem[]; 
};

export default function OrderTrackingPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [masterList, setMasterList] = useState<MasterItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'Pending' | 'Received'>('Pending');

  // --- MODAL STATE ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // --- NEW ORDER FORM ---
  const [newOrder, setNewOrder] = useState<{
    po_number: string;
    order_type: 'Purchase Request' | 'Store Request';
    cost_center: string;
    source_name: string;
    items: { master_id: string; quantity: number }[];
  }>({
    po_number: '',
    order_type: 'Purchase Request',
    cost_center: 'Housekeeping',
    source_name: '',
    items: [{ master_id: '', quantity: 0 }]
  });

  // --- RECEIVE FORM ---
  const [destinationStore, setDestinationStore] = useState('HK Main Store');

  // --- FETCH DATA ---
  const fetchData = async () => {
    setIsLoading(true);
    
    // 1. Fetch Catalog
    const { data: masters } = await supabase.from('hsk_master_catalog').select('id, article_number, item_name, unit');
    if (masters) setMasterList(masters);

    // 2. Fetch Orders
    const { data: orderData } = await supabase
      .from('hsk_orders')
      .select(`
        *,
        items:hsk_order_items (
          quantity,
          master:hsk_master_catalog ( item_name, article_number, unit )
        )
      `)
      .order('created_at', { ascending: false });
    
    if (orderData) setOrders(orderData as any);
    setIsLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // --- CREATE ORDER LOGIC ---
  const handleAddItemRow = () => {
    setNewOrder({ ...newOrder, items: [...newOrder.items, { master_id: '', quantity: 0 }] });
  };

  const handleRemoveItemRow = (index: number) => {
    const updated = [...newOrder.items];
    updated.splice(index, 1);
    setNewOrder({ ...newOrder, items: updated });
  };

  const handleItemChange = (index: number, field: 'master_id' | 'quantity', value: any) => {
    const updated = [...newOrder.items];
    updated[index] = { ...updated[index], [field]: value };
    setNewOrder({ ...newOrder, items: updated });
  };

  const submitOrder = async () => {
    if (!newOrder.po_number || !newOrder.source_name) return alert("Fill all details");
    
    // 1. Create Header
    const { data: order, error } = await supabase.from('hsk_orders').insert({
      po_number: newOrder.po_number,
      order_type: newOrder.order_type,
      cost_center: newOrder.cost_center,
      source_name: newOrder.source_name,
      status: 'Pending',
      request_date: new Date().toISOString().split('T')[0]
    }).select().single();

    if (error || !order) return alert("Failed to create order");

    // 2. Create Items
    const itemsToInsert = newOrder.items
      .filter(i => i.master_id && i.quantity > 0)
      .map(i => ({
        order_id: order.id,
        master_id: i.master_id,
        quantity: i.quantity
      }));
    
    await supabase.from('hsk_order_items').insert(itemsToInsert);

    setIsModalOpen(false);
    // Reset Form
    setNewOrder({ po_number: '', order_type: 'Purchase Request', cost_center: 'Housekeeping', source_name: '', items: [{ master_id: '', quantity: 0 }] });
    fetchData();
  };

  // --- RECEIVE LOGIC ---
  const handleReceiveOrder = async () => {
    if (!selectedOrder) return;

    const monthKey = new Date().toISOString().slice(0, 7); // "2024-02"

    // 1. Loop through items and add to Monthly Stock
    const updates = selectedOrder.items?.map(async (item: any) => {
        // Find existing stock record for this month
        const { data: existing } = await supabase
           .from('hsk_monthly_stock')
           .select('*')
           .eq('month_year', monthKey)
           .eq('master_id', item.master.id || item.master_id)
           .eq('store_name', destinationStore)
           .single();

        if (existing) {
           await supabase.from('hsk_monthly_stock').update({
              added_stock: existing.added_stock + item.quantity
           }).eq('id', existing.id);
        } else {
           await supabase.from('hsk_monthly_stock').insert({
              month_year: monthKey,
              master_id: item.master.id || item.master_id,
              store_name: destinationStore,
              opening_stock: 0,
              added_stock: item.quantity,
              consumed: 0, damaged: 0, transferred: 0
           });
        }
    });

    if (updates) await Promise.all(updates);

    // 2. Mark Order as Received
    await supabase.from('hsk_orders').update({
        status: 'Received',
        received_date: new Date().toISOString().split('T')[0]
    }).eq('id', selectedOrder.id);

    setIsReceiveModalOpen(false);
    setSelectedOrder(null);
    fetchData();
    alert("Order Received! Inventory updated.");
  };

  // --- FILTERING ---
  const filteredOrders = orders.filter(o => o.status === activeTab);

  return (
    <div className="min-h-screen p-6 pb-20 bg-[#FDFBFD] font-antiqua text-[#6D2158]">
      
      {/* --- HEADER --- */}
      <div className="flex flex-col md:flex-row justify-between items-end border-b border-slate-200 pb-6 gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Order Tracking</h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">
            Procurement & Transfers • {activeTab} Orders
          </p>
        </div>
        
        <div className="flex gap-2">
           <button onClick={() => setActiveTab('Pending')} className={`px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border ${activeTab === 'Pending' ? 'bg-[#6D2158] text-white border-[#6D2158]' : 'bg-white text-slate-400 border-slate-200'}`}>
              Pending
           </button>
           <button onClick={() => setActiveTab('Received')} className={`px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border ${activeTab === 'Received' ? 'bg-[#6D2158] text-white border-[#6D2158]' : 'bg-white text-slate-400 border-slate-200'}`}>
              History
           </button>
           <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg hover:shadow-emerald-600/40 ml-4">
              <Plus size={16}/> New Order
           </button>
        </div>
      </div>

      {/* --- ORDER LIST --- */}
      <div className="grid grid-cols-1 gap-4 mt-6">
         {filteredOrders.length === 0 && !isLoading && (
            <div className="text-center py-20 text-slate-300 font-bold uppercase text-xs tracking-widest">No {activeTab} Orders</div>
         )}
         
         {filteredOrders.map(order => (
            <div key={order.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6 hover:shadow-md transition-all">
               
               {/* Info Block */}
               <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                     <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase flex items-center gap-1 ${order.order_type === 'Purchase Request' ? 'bg-purple-50 text-purple-600 border border-purple-100' : 'bg-blue-50 text-blue-600 border border-blue-100'}`}>
                        {order.order_type === 'Purchase Request' ? <ShoppingCart size={10}/> : <Store size={10}/>}
                        {order.order_type}
                     </span>
                     <span className="text-lg font-bold text-[#6D2158]">{order.po_number}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-bold text-slate-500">
                     <span className="flex items-center gap-1"><Store size={12}/> {order.source_name}</span>
                     <span className="text-slate-300">•</span>
                     <span>{order.cost_center}</span>
                     <span className="text-slate-300">•</span>
                     <span className="flex items-center gap-1"><Clock size={12}/> {order.request_date}</span>
                  </div>
               </div>

               {/* Items Summary */}
               <div className="flex-1 flex gap-2 overflow-x-auto max-w-md">
                   {order.items?.slice(0, 3).map((item: any, i) => (
                      <div key={i} className="px-3 py-1 bg-slate-50 rounded-lg text-xs font-bold text-slate-600 border border-slate-100 whitespace-nowrap">
                         {item.quantity} x {item.master.item_name}
                      </div>
                   ))}
                   {(order.items?.length || 0) > 3 && (
                      <div className="px-3 py-1 bg-slate-50 rounded-lg text-xs font-bold text-slate-400 border border-slate-100">
                         +{(order.items?.length || 0) - 3} more
                      </div>
                   )}
               </div>

               {/* Actions */}
               <div>
                  {order.status === 'Pending' ? (
                      <button 
                        onClick={() => { setSelectedOrder(order); setIsReceiveModalOpen(true); }}
                        className="flex items-center gap-2 px-5 py-2 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-emerald-600 hover:text-white transition-all"
                      >
                         <ArrowDownToLine size={16}/> Receive
                      </button>
                  ) : (
                      <span className="flex items-center gap-2 text-emerald-600 font-bold text-xs uppercase tracking-wider bg-emerald-50 px-4 py-2 rounded-xl">
                         <CheckCircle2 size={16}/> Received {order.received_date}
                      </span>
                  )}
               </div>
            </div>
         ))}
      </div>

      {/* --- CREATE ORDER MODAL --- */}
      {isModalOpen && (
         <div className="fixed inset-0 bg-[#6D2158]/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl p-6 h-[80vh] flex flex-col">
               <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold text-[#6D2158]">New Order Request</h3>
                  <button onClick={() => setIsModalOpen(false)}><X size={24} className="text-slate-300 hover:text-rose-500"/></button>
               </div>
               
               <div className="flex-1 overflow-y-auto space-y-6 pr-2">
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Order Type</label>
                        <select className="w-full p-3 border rounded-xl font-bold mt-1 text-sm bg-slate-50" value={newOrder.order_type} onChange={e => setNewOrder({...newOrder, order_type: e.target.value as any})}>
                           <option>Purchase Request</option>
                           <option>Store Request</option>
                        </select>
                     </div>
                     <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Cost Center (Requester)</label>
                        <select className="w-full p-3 border rounded-xl font-bold mt-1 text-sm bg-slate-50" value={newOrder.cost_center} onChange={e => setNewOrder({...newOrder, cost_center: e.target.value})}>
                           <option>Housekeeping</option>
                           <option>Minibar</option>
                           <option>Garden</option>
                           <option>Laundry</option>
                        </select>
                     </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase">PR No. or SR No.</label>
                        <input type="text" className="w-full p-3 border rounded-xl font-bold mt-1 text-sm" placeholder="e.g. PR-1025" value={newOrder.po_number} onChange={e => setNewOrder({...newOrder, po_number: e.target.value})} />
                     </div>
                     <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Source (Supplier / Store)</label>
                        <input type="text" className="w-full p-3 border rounded-xl font-bold mt-1 text-sm" placeholder="e.g. Seagull OR F&B Store" value={newOrder.source_name} onChange={e => setNewOrder({...newOrder, source_name: e.target.value})} />
                     </div>
                  </div>

                  <hr className="border-slate-100"/>
                  
                  <div>
                     <div className="flex justify-between items-center mb-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Order Items</label>
                        <button onClick={handleAddItemRow} className="text-[10px] font-bold text-emerald-600 uppercase hover:underline">+ Add Row</button>
                     </div>
                     <div className="space-y-2">
                        {newOrder.items.map((item, index) => (
                           <div key={index} className="flex gap-2">
                              <select 
                                className="flex-[3] p-2 border rounded-lg font-bold text-sm bg-slate-50"
                                value={item.master_id}
                                onChange={e => handleItemChange(index, 'master_id', e.target.value)}
                              >
                                 <option value="">Select Item...</option>
                                 {masterList.map(m => (
                                    <option key={m.id} value={m.id}>{m.item_name} ({m.article_number})</option>
                                 ))}
                              </select>
                              <input 
                                type="number" 
                                placeholder="Qty" 
                                className="flex-1 p-2 border rounded-lg font-bold text-sm text-center"
                                value={item.quantity}
                                onChange={e => handleItemChange(index, 'quantity', Number(e.target.value))}
                              />
                              <button onClick={() => handleRemoveItemRow(index)} className="p-2 text-rose-400 hover:text-rose-600"><X size={16}/></button>
                           </div>
                        ))}
                     </div>
                  </div>
               </div>

               <div className="mt-6 pt-4 border-t border-slate-100">
                  <button onClick={submitOrder} className="w-full py-4 bg-[#6D2158] text-white rounded-xl font-bold uppercase tracking-widest shadow-lg hover:shadow-[#6D2158]/40">
                     Create Order
                  </button>
               </div>
            </div>
         </div>
      )}

      {/* --- RECEIVE MODAL --- */}
      {isReceiveModalOpen && selectedOrder && (
         <div className="fixed inset-0 bg-[#6D2158]/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-6">
               <h3 className="text-xl font-bold text-[#6D2158] mb-2">Receive Goods</h3>
               <p className="text-sm font-bold text-slate-400 mb-6">Confirm receipt for: {selectedOrder.po_number}</p>
               
               <div className="mb-6">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Destination Store</label>
                  <select 
                     className="w-full p-3 border rounded-xl font-bold mt-1 text-sm bg-slate-50"
                     value={destinationStore}
                     onChange={(e) => setDestinationStore(e.target.value)}
                  >
                     <option>HK Main Store</option>
                     <option>HK Chemical Store</option>
                  </select>
                  <p className="text-[10px] font-bold text-amber-500 mt-2">
                     ⚠ This will add {selectedOrder.items?.reduce((s: any, i: any) => s + i.quantity, 0)} items to your inventory immediately.
                  </p>
               </div>

               <div className="flex gap-2">
                  <button onClick={() => setIsReceiveModalOpen(false)} className="flex-1 py-3 text-slate-400 font-bold uppercase text-xs border border-slate-200 rounded-xl">Cancel</button>
                  <button onClick={handleReceiveOrder} className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold uppercase text-xs shadow-lg">Confirm Receipt</button>
               </div>
            </div>
         </div>
      )}

    </div>
  );
}
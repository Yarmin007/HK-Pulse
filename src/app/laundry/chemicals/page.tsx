'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import PageHeader from '@/components/PageHeader';
import { 
  Droplets, 
  Plus, 
  ShoppingCart, 
  Printer, 
  Search, 
  FileText, 
  CheckCircle2, 
  DollarSign,
  Edit3,
  History,
  Settings2,
  X,
  BarChart3,
  TrendingUp,
  PackageSearch,
  AlertTriangle
} from 'lucide-react';

interface ChemicalItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  unit_rate: number;
  current_stock: number;
  min_stock_level: number;
  is_active: boolean;
}

interface OrderRecord {
  id: string;
  request_number: string;
  pr_number?: string;
  order_date: string;
  received_date?: string;
  status: 'Requested' | 'Ordered' | 'Order Received' | 'Cancelled';
  requested_by: string;
  prepared_title?: string;
  approved_by?: string;
  approved_title?: string;
  total_amount: number;
  notes?: string;
  created_at: string;
  items?: OrderItemDetail[];
}

interface OrderItemDetail {
  id: string;
  chemical_id: string;
  quantity: number;
  received_quantity?: number;
  unit_rate: number;
  total_cost: number;
  laundry_chemicals?: {
    name: string;
    unit: string;
    category: string;
  };
}

interface StandardHost {
  id: string;
  name: string;
  position: string;
}

export default function LaundryChemicalsPage() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'order' | 'catalog' | 'history'>('dashboard');
  const [chemicals, setChemicals] = useState<ChemicalItem[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [standardHosts, setStandardHosts] = useState<StandardHost[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  // Requisition Form State
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editingRequestNum, setEditingRequestNum] = useState<string | null>(null);
  const [preparedName, setPreparedName] = useState('');
  const [preparedTitle, setPreparedTitle] = useState('Housekeeping Coordinator');
  const [approvedName, setApprovedName] = useState('');
  const [approvedTitle, setApprovedTitle] = useState('Executive Housekeeper');
  const [orderNotes, setOrderNotes] = useState('');
  const [cartQuantities, setCartQuantities] = useState<Record<string, number>>({});
  
  // Modals
  const [viewingOrder, setViewingOrder] = useState<OrderRecord | null>(null);
  const [updatingOrder, setUpdatingOrder] = useState<OrderRecord | null>(null);
  const [statusForm, setStatusForm] = useState<{
    status: OrderRecord['status'];
    pr_number: string;
    received_date: string;
    itemReceivedQtys: Record<string, number>;
  }>({
    status: 'Requested',
    pr_number: '',
    received_date: new Date().toISOString().split('T')[0],
    itemReceivedQtys: {}
  });

  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [editingChemicalId, setEditingChemicalId] = useState<string | null>(null);
  const [catalogForm, setCatalogForm] = useState({
    name: '',
    category: 'Wash Chemical',
    unit: '20L Drum',
    unit_rate: 0,
    current_stock: 0,
    min_stock_level: 2
  });

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Hosts - including h.role, h.designation, h.position, and h.job_title
      let parsedHosts: StandardHost[] = [];
      const { data: hskData } = await supabase.from('hsk_hosts').select('*');
      if (hskData && hskData.length > 0) {
        parsedHosts = hskData.map((h: any) => ({
          id: String(h.id),
          name: h.name || h.full_name || `${h.first_name || ''} ${h.last_name || ''}`.trim() || 'Staff Host',
          position: h.role || h.designation || h.position || h.job_title || h.title || 'Host'
        }));
      } else {
        const { data: fallbackData } = await supabase.from('hosts').select('*');
        if (fallbackData && fallbackData.length > 0) {
          parsedHosts = fallbackData.map((h: any) => ({
            id: String(h.id),
            name: h.name || h.full_name || `${h.first_name || ''} ${h.last_name || ''}`.trim() || 'Staff Host',
            position: h.role || h.designation || h.position || h.job_title || h.title || 'Host'
          }));
        }
      }
      parsedHosts.sort((a, b) => a.name.localeCompare(b.name));
      setStandardHosts(parsedHosts);

      // Auto-populate default signers if available
      if (!preparedName && parsedHosts.length > 0) {
        const coord = parsedHosts.find(h => 
          (h.position && h.position.toLowerCase().includes('coordinator')) ||
          (h.name && h.name.toLowerCase().includes('yamin'))
        );
        if (coord) {
          setPreparedName(coord.name);
          setPreparedTitle(coord.position);
        }
      }

      if (!approvedName && parsedHosts.length > 0) {
        const eh = parsedHosts.find(h => 
          (h.position && (h.position.toLowerCase().includes('executive') || h.position.toLowerCase().includes('housekeeper'))) ||
          (h.name && h.name.toLowerCase().includes('nadheema'))
        );
        if (eh) {
          setApprovedName(eh.name);
          setApprovedTitle(eh.position);
        }
      }

      // 2. Fetch Chemicals
      const { data: chemData } = await supabase
        .from('laundry_chemicals')
        .select('id, name, category, unit, unit_rate, current_stock, min_stock_level, is_active')
        .eq('is_active', true)
        .order('name', { ascending: true });
      setChemicals(chemData || []);

      // 3. Fetch Orders
      const { data: orderData } = await supabase
        .from('laundry_chemical_orders')
        .select(`
          *,
          items:laundry_chemical_order_items(
            id,
            chemical_id,
            quantity,
            received_quantity,
            unit_rate,
            total_cost,
            laundry_chemicals(name, unit, category)
          )
        `)
        .order('created_at', { ascending: false });
      setOrders(orderData || []);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredChemicals = useMemo(() => {
    return chemicals.filter(c => 
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      c.category.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [chemicals, searchQuery]);

  const selectedItems = useMemo(() => {
    return chemicals
      .filter(chem => (cartQuantities[chem.id] || 0) > 0)
      .map(chem => {
        const qty = cartQuantities[chem.id] || 0;
        const total = qty * Number(chem.unit_rate || 0);
        return { chemical: chem, quantity: qty, total_cost: total };
      });
  }, [chemicals, cartQuantities]);

  const grandTotalCost = useMemo(() => {
    return selectedItems.reduce((sum, item) => sum + item.total_cost, 0);
  }, [selectedItems]);

  const handleQuantityChange = (id: string, value: string) => {
    const num = Math.max(0, parseInt(value) || 0);
    setCartQuantities(prev => ({ ...prev, [id]: num }));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, currentIndex: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const nextIndex = currentIndex + 1;
      if (nextIndex < filteredChemicals.length && inputRefs.current[nextIndex]) {
        inputRefs.current[nextIndex]?.focus();
        inputRefs.current[nextIndex]?.select();
      }
    }
  };

  const handleEditOrder = (order: OrderRecord) => {
    setEditingOrderId(order.id);
    setEditingRequestNum(order.request_number);
    setPreparedName(order.requested_by || '');
    setPreparedTitle(order.prepared_title || 'Housekeeping Coordinator');
    setApprovedName(order.approved_by || '');
    setApprovedTitle(order.approved_title || 'Executive Housekeeper');
    setOrderNotes(order.notes || '');

    const newCart: Record<string, number> = {};
    order.items?.forEach(item => {
      newCart[item.chemical_id] = item.quantity;
    });
    setCartQuantities(newCart);
    setActiveTab('order');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCreateOrUpdateOrder = async () => {
    if (selectedItems.length === 0) {
      alert('Please enter order quantity for at least one chemical.');
      return;
    }

    setSaving(true);
    try {
      if (editingOrderId) {
        // UPDATE EXISTING
        const { error: orderError } = await supabase
          .from('laundry_chemical_orders')
          .update({
            requested_by: preparedName,
            prepared_title: preparedTitle,
            approved_by: approvedName,
            approved_title: approvedTitle,
            total_amount: grandTotalCost,
            notes: orderNotes
          })
          .eq('id', editingOrderId);

        if (orderError) throw orderError;

        // Replace Items (Delete old, insert new)
        await supabase.from('laundry_chemical_order_items').delete().eq('order_id', editingOrderId);

        const orderItems = selectedItems.map(item => ({
          order_id: editingOrderId,
          chemical_id: item.chemical.id,
          quantity: item.quantity,
          received_quantity: item.quantity,
          unit_rate: item.chemical.unit_rate,
          total_cost: item.total_cost
        }));
        
        const { error: itemsError } = await supabase.from('laundry_chemical_order_items').insert(orderItems);
        if (itemsError) throw itemsError;

        setSavedMsg(`Request form ${editingRequestNum} updated successfully!`);
      } else {
        // CREATE NEW
        const year = new Date().getFullYear();
        const count = orders.length + 1;
        const reqNum = `LND-REQ-${year}-${String(count).padStart(3, '0')}`;

        const { data: order, error: orderError } = await supabase
          .from('laundry_chemical_orders')
          .insert([{
            request_number: reqNum,
            order_date: new Date().toISOString().split('T')[0],
            status: 'Requested',
            requested_by: preparedName,
            prepared_title: preparedTitle,
            approved_by: approvedName,
            approved_title: approvedTitle,
            total_amount: grandTotalCost,
            notes: orderNotes
          }])
          .select()
          .single();

        if (orderError) throw orderError;

        const orderItems = selectedItems.map(item => ({
          order_id: order.id,
          chemical_id: item.chemical.id,
          quantity: item.quantity,
          received_quantity: item.quantity,
          unit_rate: item.chemical.unit_rate,
          total_cost: item.total_cost
        }));

        const { error: itemsError } = await supabase.from('laundry_chemical_order_items').insert(orderItems);
        if (itemsError) throw itemsError;

        setSavedMsg(`Request form ${reqNum} generated successfully!`);
      }

      setTimeout(() => setSavedMsg(''), 4000);
      setEditingOrderId(null);
      setEditingRequestNum(null);
      setCartQuantities({});
      setOrderNotes('');
      loadData();
      setActiveTab('history');
    } catch (err) {
      console.error('Order creation error:', err);
      alert('Failed to save chemical request.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingOrderId(null);
    setEditingRequestNum(null);
    setCartQuantities({});
    setOrderNotes('');
  };

  // --- DASHBOARD CALCULATIONS ---
  const currentMonth = new Date().toISOString().slice(0, 7);
  const totalOrderedThisMonth = useMemo(() => {
    return orders
      .filter(o => o.order_date.startsWith(currentMonth) && o.status !== 'Cancelled')
      .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  }, [orders, currentMonth]);

  const ytdSpend = useMemo(() => {
    const year = new Date().getFullYear().toString();
    return orders
      .filter(o => o.order_date.startsWith(year) && o.status !== 'Cancelled')
      .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  }, [orders]);

  const categorySpend = useMemo(() => {
    const data: Record<string, number> = {};
    orders.forEach(o => {
      if (o.status !== 'Cancelled') {
        o.items?.forEach(item => {
          const cat = item.laundry_chemicals?.category || 'Unknown';
          data[cat] = (data[cat] || 0) + Number(item.total_cost);
        });
      }
    });
    return Object.entries(data).sort((a, b) => b[1] - a[1]);
  }, [orders]);

  const topItems = useMemo(() => {
    const data: Record<string, { name: string, qty: number, cost: number }> = {};
    orders.forEach(o => {
      if (o.status !== 'Cancelled') {
        o.items?.forEach(item => {
          const name = item.laundry_chemicals?.name || 'Unknown';
          if (!data[name]) data[name] = { name, qty: 0, cost: 0 };
          data[name].qty += Number(item.quantity);
          data[name].cost += Number(item.total_cost);
        });
      }
    });
    return Object.values(data).sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [orders]);

  // --- MODAL LOGIC FOR UPDATING STATUS & CATALOG ---

  const openStatusUpdateModal = (order: OrderRecord) => {
    setUpdatingOrder(order);
    const itemMap: Record<string, number> = {};
    (order.items || []).forEach(it => {
      itemMap[it.id] = Number(it.received_quantity !== undefined && it.received_quantity !== null ? it.received_quantity : it.quantity);
    });

    setStatusForm({
      status: order.status,
      pr_number: order.pr_number || '',
      received_date: order.received_date || new Date().toISOString().split('T')[0],
      itemReceivedQtys: itemMap
    });
  };

  const handleSaveStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updatingOrder) return;
    try {
      const { error: masterErr } = await supabase
        .from('laundry_chemical_orders')
        .update({
          status: statusForm.status,
          pr_number: statusForm.status === 'Ordered' || statusForm.status === 'Order Received' ? statusForm.pr_number : updatingOrder.pr_number,
          received_date: statusForm.status === 'Order Received' ? statusForm.received_date : updatingOrder.received_date
        })
        .eq('id', updatingOrder.id);
      if (masterErr) throw masterErr;

      if (statusForm.status === 'Order Received' && updatingOrder.items) {
        for (const item of updatingOrder.items) {
          const recQty = Number(statusForm.itemReceivedQtys[item.id] !== undefined ? statusForm.itemReceivedQtys[item.id] : item.quantity);
          await supabase.from('laundry_chemical_order_items').update({ received_quantity: recQty }).eq('id', item.id);
        }
      }
      setUpdatingOrder(null);
      loadData();
    } catch (err) {
      console.error(err);
      alert('Failed to update status.');
    }
  };

  const handleSaveCatalog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catalogForm.name.trim()) return;
    try {
      if (editingChemicalId) {
        await supabase.from('laundry_chemicals').update({
          name: catalogForm.name.trim(), category: catalogForm.category, unit: catalogForm.unit,
          unit_rate: Number(catalogForm.unit_rate) || 0, current_stock: Number(catalogForm.current_stock) || 0,
          min_stock_level: Number(catalogForm.min_stock_level) || 0
        }).eq('id', editingChemicalId);
      } else {
        await supabase.from('laundry_chemicals').insert([{
          code: `CHEM-${Date.now().toString().slice(-5)}`, name: catalogForm.name.trim(),
          category: catalogForm.category, unit: catalogForm.unit, unit_rate: Number(catalogForm.unit_rate) || 0,
          current_stock: Number(catalogForm.current_stock) || 0, min_stock_level: Number(catalogForm.min_stock_level) || 0,
          is_active: true
        }]);
      }
      setShowCatalogModal(false);
      setEditingChemicalId(null);
      loadData();
    } catch (err) {
      console.error(err);
      alert('Failed to save item.');
    }
  };

  return (
    <div className="space-y-6 pb-20 max-w-full">
      {/* ----------------------------------------------------- */}
      {/* EVERYTHING HERE gets print:hidden to hide safely     */}
      {/* ----------------------------------------------------- */}
      <div className="print:hidden">
        <PageHeader 
          title="Laundry Chemical Management" 
          subtitle="Generate official purchase request forms, track inventory spend, and monitor PR status."
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-3 rounded-xl border border-gray-200 shadow-sm print:hidden">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'dashboard' ? 'bg-[#6D2158] text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <BarChart3 className="w-4 h-4" /> Dashboard
          </button>
          
          <button
            onClick={() => setActiveTab('order')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'order' ? 'bg-[#6D2158] text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <ShoppingCart className="w-4 h-4" /> Request Form
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'history' ? 'bg-[#6D2158] text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <History className="w-4 h-4" /> Tracking ({orders.length})
          </button>

          <button
            onClick={() => setActiveTab('catalog')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'catalog' ? 'bg-[#6D2158] text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Settings2 className="w-4 h-4" /> Rates ({chemicals.length})
          </button>
        </div>

        {activeTab === 'catalog' && (
          <button
            onClick={() => {
              setEditingChemicalId(null);
              setCatalogForm({ name: '', category: 'Wash Chemical', unit: '20L Drum', unit_rate: 0, current_stock: 0, min_stock_level: 2 });
              setShowCatalogModal(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg shadow-sm"
          >
            <Plus className="w-4 h-4" /> Add Chemical
          </button>
        )}
      </div>

      {savedMsg && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-4 py-3 rounded-lg print:hidden animate-in fade-in slide-in-from-top-4">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          {savedMsg}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 0: ANALYTICS DASHBOARD                                */}
      {/* ========================================================= */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6 print:hidden">
          
          {/* KPI Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-lg"><DollarSign className="w-5 h-5" /></div>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">MTD</span>
              </div>
              <div className="text-sm font-semibold text-gray-500">Spend This Month</div>
              <div className="text-2xl font-black text-gray-900 mt-0.5">${totalOrderedThisMonth.toFixed(2)}</div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <div className="p-2.5 bg-blue-50 text-blue-700 rounded-lg"><TrendingUp className="w-5 h-5" /></div>
                <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">YTD</span>
              </div>
              <div className="text-sm font-semibold text-gray-500">Year to Date Spend</div>
              <div className="text-2xl font-black text-gray-900 mt-0.5">${ytdSpend.toFixed(2)}</div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <div className="p-2.5 bg-amber-50 text-amber-700 rounded-lg"><ShoppingCart className="w-5 h-5" /></div>
                <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">Active</span>
              </div>
              <div className="text-sm font-semibold text-gray-500">Pending Deliveries</div>
              <div className="text-2xl font-black text-gray-900 mt-0.5">
                {orders.filter(o => o.status === 'Requested' || o.status === 'Ordered').length} Orders
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <div className="p-2.5 bg-purple-50 text-purple-700 rounded-lg"><PackageSearch className="w-5 h-5" /></div>
                <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">Top</span>
              </div>
              <div className="text-sm font-semibold text-gray-500">Most Ordered Item</div>
              <div className="text-lg font-bold text-gray-900 mt-1 truncate" title={topItems[0]?.name}>
                {topItems[0]?.name || 'N/A'}
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Category Spend */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Droplets className="w-4 h-4 text-gray-400" /> Lifetime Spend by Category
              </h3>
              <div className="space-y-4">
                {categorySpend.map(([cat, amount], idx) => {
                  const max = Math.max(...categorySpend.map(c => c[1]));
                  const pct = Math.round((amount / max) * 100);
                  const colors = ['bg-[#6D2158]', 'bg-purple-600', 'bg-emerald-600', 'bg-blue-600', 'bg-amber-500'];
                  const color = colors[idx % colors.length];

                  return (
                    <div key={cat}>
                      <div className="flex justify-between text-xs mb-1 font-semibold">
                        <span className="text-gray-700">{cat}</span>
                        <span className="text-gray-900">${amount.toFixed(2)}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className={`${color} h-2 rounded-full transition-all duration-1000`} style={{ width: `${pct}%` }}></div>
                      </div>
                    </div>
                  );
                })}
                {categorySpend.length === 0 && <div className="text-xs text-gray-400 text-center py-4">No data available yet.</div>}
              </div>
            </div>

            {/* Top 5 Volume Items */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-gray-400" /> Top 5 Highly Consumed Items
              </h3>
              <div className="space-y-4">
                {topItems.map((item, idx) => (
                  <div key={item.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded bg-white border border-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                        {idx + 1}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-gray-900 truncate max-w-[200px]" title={item.name}>{item.name}</div>
                        <div className="text-[10px] text-gray-500">{item.qty} units ordered</div>
                      </div>
                    </div>
                    <div className="text-xs font-black text-emerald-700 text-right">
                      ${item.cost.toFixed(2)}
                    </div>
                  </div>
                ))}
                {topItems.length === 0 && <div className="text-xs text-gray-400 text-center py-4">No data available yet.</div>}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* TAB 1: NEW / EDIT REQUISITION (print:hidden applied) */}
      {activeTab === 'order' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 print:hidden">
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
            
            {editingOrderId && (
              <div className="flex justify-between items-center bg-amber-50 border border-amber-200 p-3 rounded-lg text-amber-900 mb-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  <div>
                    <strong className="block text-sm">Editing Requisition: {editingRequestNum}</strong>
                    <span className="text-xs">Saving will update this record. Received quantities will reset.</span>
                  </div>
                </div>
                <button onClick={handleCancelEdit} className="px-3 py-1.5 bg-white border border-amber-300 rounded text-xs font-bold hover:bg-amber-100 transition">
                  Cancel Edit
                </button>
              </div>
            )}

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Select Laundry Chemicals</h3>
                <p className="text-xs text-gray-500">
                  Type quantity and press <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-[10px] font-mono">Enter</kbd> to jump to the next item.
                </p>
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input 
                  type="text"
                  placeholder="Search chemical name..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1 border border-gray-300 rounded-lg text-xs w-48 focus:outline-none focus:ring-1 focus:ring-[#6D2158]"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 font-semibold text-gray-600 uppercase">
                    <th className="py-2.5 px-3">Chemical Name</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">Pack Unit</th>
                    <th className="py-2.5 px-3 text-right">Rate ($)</th>
                    <th className="py-2.5 px-3 text-center w-28">Order Qty</th>
                    <th className="py-2.5 px-3 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredChemicals.map((chem, idx) => {
                    const qty = cartQuantities[chem.id] || 0;
                    const lineTotal = qty * Number(chem.unit_rate || 0);

                    return (
                      <tr key={chem.id} className={`${qty > 0 ? 'bg-purple-50/40' : 'hover:bg-gray-50/60'} transition`}>
                        <td className="py-2.5 px-3 font-bold text-gray-900">{chem.name}</td>
                        <td className="py-2.5 px-3 text-gray-500 text-[11px]">{chem.category}</td>
                        <td className="py-2.5 px-3 text-gray-600 font-medium">{chem.unit}</td>
                        <td className="py-2.5 px-3 text-right font-medium text-gray-700">
                          ${Number(chem.unit_rate).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <input 
                            ref={el => { inputRefs.current[idx] = el; }}
                            type="number" 
                            min="0"
                            placeholder="0"
                            value={cartQuantities[chem.id] ?? ''}
                            onChange={e => handleQuantityChange(chem.id, e.target.value)}
                            onKeyDown={e => handleKeyDown(e, idx)}
                            className={`w-20 text-center py-1 border rounded-md font-bold text-xs focus:ring-2 focus:ring-[#6D2158] focus:border-[#6D2158] focus:outline-none ${qty > 0 ? 'border-purple-300 text-purple-900 bg-white' : 'border-gray-300 text-gray-900'}`}
                          />
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-gray-900">
                          ${lineTotal.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="border-b border-gray-100 pb-2">
                <div className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">Purchase Requisition</div>
                <h3 className="text-sm font-black text-gray-900">Sign-Offs & Summary</h3>
              </div>

              <div className="space-y-3">
                {/* PREPARED BY - Direct Search & Auto-Fill Designation */}
                <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
                  <label className="block text-[11px] font-bold text-gray-800">Prepared By</label>
                  <div className="space-y-1.5">
                    <input 
                      type="text" 
                      list="prepared-hosts-list"
                      placeholder="Type name to auto-search..."
                      value={preparedName}
                      onChange={e => {
                        const val = e.target.value;
                        setPreparedName(val);
                        const match = standardHosts.find(h => h.name.toLowerCase() === val.toLowerCase());
                        if (match && match.position && match.position.toLowerCase() !== 'host') {
                          setPreparedTitle(match.position);
                        }
                      }}
                      className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#6D2158]"
                    />
                    <datalist id="prepared-hosts-list">
                      {standardHosts.map(h => (
                        <option key={h.id} value={h.name}>
                          {h.position !== 'Host' ? h.position : ''}
                        </option>
                      ))}
                    </datalist>
                    <input 
                      type="text" 
                      placeholder="Designation / Title"
                      value={preparedTitle}
                      onChange={e => setPreparedTitle(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded text-[11px] text-gray-700 font-medium focus:outline-none focus:ring-1 focus:ring-[#6D2158]"
                    />
                  </div>
                </div>

                {/* APPROVED BY - Direct Search & Auto-Fill Designation */}
                <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
                  <label className="block text-[11px] font-bold text-gray-800">Approved By</label>
                  <div className="space-y-1.5">
                    <input 
                      type="text" 
                      list="approved-hosts-list"
                      placeholder="Type name to auto-search..."
                      value={approvedName}
                      onChange={e => {
                        const val = e.target.value;
                        setApprovedName(val);
                        const match = standardHosts.find(h => h.name.toLowerCase() === val.toLowerCase());
                        if (match && match.position && match.position.toLowerCase() !== 'host') {
                          setApprovedTitle(match.position);
                        }
                      }}
                      className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#6D2158]"
                    />
                    <datalist id="approved-hosts-list">
                      {standardHosts.map(h => (
                        <option key={h.id} value={h.name}>
                          {h.position !== 'Host' ? h.position : ''}
                        </option>
                      ))}
                    </datalist>
                    <input 
                      type="text" 
                      placeholder="Designation / Title"
                      value={approvedTitle}
                      onChange={e => setApprovedTitle(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded text-[11px] text-gray-700 font-medium focus:outline-none focus:ring-1 focus:ring-[#6D2158]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">Order Remarks / Purpose</label>
                  <textarea 
                    rows={2}
                    placeholder="e.g. Regular monthly linen wash detergent and stain spotter replenishment."
                    value={orderNotes}
                    onChange={e => setOrderNotes(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#6D2158]"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-gray-100">
                <div className="text-xs font-bold text-gray-800 flex justify-between">
                  <span>Selected Products</span>
                  <span>{selectedItems.length} Items</span>
                </div>

                <div className="max-h-48 overflow-y-auto divide-y divide-gray-50 text-xs pr-1">
                  {selectedItems.length === 0 ? (
                    <div className="text-center py-6 text-gray-400 text-[11px]">
                      No quantities entered yet.
                    </div>
                  ) : (
                    selectedItems.map((item, i) => (
                      <div key={i} className="py-2 flex justify-between items-center">
                        <div>
                          <div className="font-semibold text-gray-800">{item.chemical.name}</div>
                          <div className="text-[10px] text-gray-400">{item.quantity} x ${Number(item.chemical.unit_rate).toFixed(2)}</div>
                        </div>
                        <div className="font-bold text-gray-900">${item.total_cost.toFixed(2)}</div>
                      </div>
                    ))
                  )}
                </div>

                <div className="pt-2 border-t border-gray-200 flex justify-between items-center bg-gray-50 p-2 rounded-lg">
                  <span className="font-bold text-gray-900 text-sm">Total Request Value</span>
                  <span className="font-black text-base text-emerald-700">${grandTotalCost.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100 flex gap-2">
              <button
                type="button"
                onClick={() => setCartQuantities({})}
                className="w-1/3 px-3 py-2 border border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Clear
              </button>
              <button
                type="button"
                disabled={saving || selectedItems.length === 0}
                onClick={handleCreateOrUpdateOrder}
                className="w-2/3 px-4 py-2 bg-[#6D2158] hover:bg-[#581a46] text-white rounded-lg text-xs font-bold shadow-md transition disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <FileText className="w-4 h-4" />
                {saving ? 'Saving...' : editingOrderId ? 'Update Request' : 'Generate Form'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ORDER TRACKING (print:hidden applied) */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden p-4 space-y-4 print:hidden">
          <div className="flex justify-between items-center border-b border-gray-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Chemical Order Tracking & Status</h3>
              <p className="text-xs text-gray-500">
                Track status across <strong>Requested &rarr; Ordered (with PR No.) &rarr; Order Received (with actual delivery qty)</strong>.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 font-semibold text-gray-600 uppercase">
                  <th className="py-2.5 px-3">Req Number</th>
                  <th className="py-2.5 px-3">PR Number</th>
                  <th className="py-2.5 px-3">Request Date</th>
                  <th className="py-2.5 px-3">Received Date</th>
                  <th className="py-2.5 px-3">Total Value</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-gray-400">
                      No chemical requisitions created yet.
                    </td>
                  </tr>
                ) : (
                  orders.map(order => {
                    let statusBadge = 'bg-amber-100 text-amber-900 border-amber-300';
                    if (order.status === 'Ordered') statusBadge = 'bg-blue-100 text-blue-900 border-blue-300';
                    if (order.status === 'Order Received') statusBadge = 'bg-emerald-100 text-emerald-900 border-emerald-300';
                    if (order.status === 'Cancelled') statusBadge = 'bg-rose-100 text-rose-900 border-rose-300';

                    return (
                      <tr key={order.id} className="hover:bg-gray-50/70 transition">
                        <td className="py-2.5 px-3 font-extrabold text-gray-900">
                          {order.request_number}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-purple-900">
                          {order.pr_number || <span className="text-gray-400 italic">Not set</span>}
                        </td>
                        <td className="py-2.5 px-3 text-gray-600">
                          {order.order_date}
                        </td>
                        <td className="py-2.5 px-3 text-gray-600 font-medium">
                          {order.received_date || '-'}
                        </td>
                        <td className="py-2.5 px-3 font-black text-emerald-700">
                          ${Number(order.total_amount).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${statusBadge}`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openStatusUpdateModal(order)}
                              className="px-2 py-1 bg-purple-50 hover:bg-purple-100 text-purple-800 rounded border border-purple-200 text-xs font-bold transition flex items-center gap-1"
                              title="Update Status / PR / Receive Items"
                            >
                              Status
                            </button>

                            <button
                              onClick={() => handleEditOrder(order)}
                              className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded border border-amber-200 text-xs font-bold transition flex items-center gap-1"
                              title="Edit quantities or names"
                            >
                              Edit
                            </button>

                            <button
                              onClick={() => setViewingOrder(order)}
                              className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded border border-gray-300 text-xs font-bold transition flex items-center gap-1"
                              title="Print Requisition"
                            >
                              Print
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: CHEMICAL LIST & RATES */}
      {activeTab === 'catalog' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden p-4 space-y-4 print:hidden">
          <div className="flex justify-between items-center border-b border-gray-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Laundry Chemical List & Unit Rates</h3>
              <p className="text-xs text-gray-500">Maintain chemical names, pack units, and standard purchasing rates.</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 font-semibold text-gray-600 uppercase">
                  <th className="py-2.5 px-4">Chemical Name</th>
                  <th className="py-2.5 px-4">Category</th>
                  <th className="py-2.5 px-4">Packaging Unit</th>
                  <th className="py-2.5 px-4 text-right">Standard Rate ($)</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {chemicals.map(chem => (
                  <tr key={chem.id} className="hover:bg-gray-50/70 transition">
                    <td className="py-2.5 px-4 font-bold text-gray-900 text-sm">{chem.name}</td>
                    <td className="py-2.5 px-4 text-gray-500">{chem.category}</td>
                    <td className="py-2.5 px-4 text-gray-700 font-medium">{chem.unit}</td>
                    <td className="py-2.5 px-4 text-right font-black text-emerald-700 text-sm">
                      ${Number(chem.unit_rate).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        onClick={() => {
                          setEditingChemicalId(chem.id);
                          setCatalogForm({
                            name: chem.name,
                            category: chem.category,
                            unit: chem.unit,
                            unit_rate: chem.unit_rate,
                            current_stock: chem.current_stock,
                            min_stock_level: chem.min_stock_level
                          });
                          setShowCatalogModal(true);
                        }}
                        className="p-1.5 text-gray-500 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition"
                        title="Edit rate or packaging"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: UPDATE STATUS (print:hidden applied) */}
      {updatingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 print:hidden">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-gray-100 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-base font-bold text-gray-900">
                Update Order Status: {updatingOrder.request_number}
              </h3>
              <button 
                onClick={() => setUpdatingOrder(null)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Move status to Ordered to enter PR number, or Order Received to log delivery date & received quantities.
            </p>

            <form onSubmit={handleSaveStatusUpdate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Order Status</label>
                <select
                  value={statusForm.status}
                  onChange={e => setStatusForm({ ...statusForm, status: e.target.value as OrderRecord['status'] })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-bold focus:ring-2 focus:ring-[#6D2158]"
                >
                  <option value="Requested">Requested (Internal Request Slip Generated)</option>
                  <option value="Ordered">Ordered (PR Raised with Purchasing)</option>
                  <option value="Order Received">Order Received (Stock Delivered to Laundry)</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>

              {(statusForm.status === 'Ordered' || statusForm.status === 'Order Received') && (
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg space-y-2">
                  <label className="block text-xs font-bold text-purple-900">Purchase Request (PR) Number</label>
                  <input 
                    type="text"
                    required={statusForm.status === 'Ordered'}
                    placeholder="e.g. PR-2026-0941 / PO-6427"
                    value={statusForm.pr_number}
                    onChange={e => setStatusForm({ ...statusForm, pr_number: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-purple-300 rounded-lg text-xs font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              )}

              {statusForm.status === 'Order Received' && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-emerald-900 mb-1">Delivery / Received Date</label>
                    <input 
                      type="date"
                      required
                      value={statusForm.received_date}
                      onChange={e => setStatusForm({ ...statusForm, received_date: e.target.value })}
                      className="w-full px-3 py-1.5 bg-white border border-emerald-300 rounded-lg text-xs font-semibold text-gray-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-emerald-900 mb-1.5">
                      Verify Received Quantity (Adjust if less delivered than ordered):
                    </label>
                    <div className="max-h-48 overflow-y-auto space-y-2 bg-white p-2 rounded-lg border border-emerald-200">
                      {updatingOrder.items?.map(it => (
                        <div key={it.id} className="flex justify-between items-center text-xs py-1 border-b border-gray-100 last:border-none">
                          <div>
                            <span className="font-bold text-gray-900">{it.laundry_chemicals?.name}</span>
                            <span className="text-[10px] text-gray-500 block">Ordered: {it.quantity} {it.laundry_chemicals?.unit}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-gray-400">Recv:</span>
                            <input 
                              type="number"
                              min="0"
                              value={statusForm.itemReceivedQtys[it.id] ?? it.quantity}
                              onChange={e => {
                                const val = parseFloat(e.target.value) || 0;
                                setStatusForm(prev => ({
                                  ...prev,
                                  itemReceivedQtys: { ...prev.itemReceivedQtys, [it.id]: val }
                                }));
                              }}
                              className="w-16 text-center py-1 border border-gray-300 rounded font-bold text-xs"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setUpdatingOrder(null)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#6D2158] hover:bg-[#581a46] text-white text-xs font-bold rounded-lg shadow"
                >
                  Save Status
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: VIEW / PRINT REQUISITION SLIP                      */}
      {/* ========================================================= */}
      {viewingOrder && (
        <div className="modal-print-wrapper fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto print:static print:p-0 print:m-0 print:block">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm -z-10 print:hidden" onClick={() => setViewingOrder(null)}></div>
          
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-gray-200 mt-8 print:shadow-none print:border-none print:p-0 print:m-0 print:max-w-none print:rounded-none relative z-10">
            
            {/* Top Toolbar (Hidden on Print) */}
            <div className="flex justify-between items-center border-b border-gray-200 pb-3 mb-6 print:hidden">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">A4 Purchase Request Slip</span>
                {viewingOrder.pr_number && (
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-900 border border-purple-300 rounded text-xs font-bold">
                    PR #{viewingOrder.pr_number}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#6D2158] hover:bg-[#581a46] text-white text-xs font-bold rounded-lg shadow"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print / Save PDF
                </button>
                <button 
                  onClick={() => setViewingOrder(null)} 
                  className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* PRINT CONTAINER */}
            <div className="bg-white text-black print:p-6">
              
              {/* Header */}
              <div className="border-b-2 border-black pb-2 mb-4 flex justify-between items-end">
                <div>
                  <div className="text-[12px] font-bold tracking-widest text-gray-800 uppercase">
                    SIX SENSES LAAMU
                  </div>
                  <div className="text-xs font-extrabold uppercase mt-0.5 text-gray-900">
                    Department: Housekeeping / Laundry
                  </div>
                  <h1 className="text-base font-black uppercase tracking-tight mt-1 text-black">
                    Laundry Chemical Purchase Request
                  </h1>
                </div>

                <div className="text-right text-xs space-y-0.5 text-gray-900">
                  <div className="font-extrabold text-sm text-black">{viewingOrder.request_number}</div>
                  <div><strong>Date:</strong> {viewingOrder.order_date}</div>
                  {viewingOrder.pr_number && (
                    <div><strong>PR No:</strong> {viewingOrder.pr_number}</div>
                  )}
                </div>
              </div>

              {/* Meta Grid */}
              <div className="grid grid-cols-2 gap-4 text-xs border border-gray-300 p-3 bg-gray-50/50 mb-4 print:bg-transparent">
                <div className="space-y-1">
                  <div><span className="text-gray-500 w-24 inline-block">Requested By:</span> <strong className="text-gray-900">{viewingOrder.requested_by}</strong></div>
                  <div><span className="text-gray-500 w-24 inline-block">Cost Center:</span> <strong className="text-gray-900">Guest Laundry</strong></div>
                </div>
                <div className="space-y-1">
                  <div><span className="text-gray-500 w-28 inline-block">Requisition Status:</span> <strong className="uppercase text-gray-900">{viewingOrder.status}</strong></div>
                  <div><span className="text-gray-500 w-28 inline-block">Estimated Total:</span> <strong className="text-emerald-800">${Number(viewingOrder.total_amount).toFixed(2)}</strong></div>
                </div>
              </div>

              {viewingOrder.notes && (
                <div className="text-xs text-gray-800 mb-4 border border-dashed border-gray-400 p-2.5 rounded print:border-solid">
                  <strong>Purpose / Justification:</strong> {viewingOrder.notes}
                </div>
              )}

              {/* Line Items Table */}
              <table className="w-full border-collapse border border-black text-xs mb-8">
                <thead>
                  <tr className="bg-gray-100 border-b-2 border-black text-left print:bg-gray-200">
                    <th className="py-2 px-2 border-r border-black text-center w-8">#</th>
                    <th className="py-2 px-3 border-r border-black">Item Description</th>
                    <th className="py-2 px-3 border-r border-black text-center w-24">Packaging</th>
                    <th className="py-2 px-3 border-r border-black text-center w-20">Req Qty</th>
                    <th className="py-2 px-3 border-r border-black text-right w-24">Unit Rate</th>
                    <th className="py-2 px-3 text-right w-28">Total ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-300">
                  {viewingOrder.items?.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-300">
                      <td className="py-1.5 px-2 border-r border-black text-center font-medium">{idx + 1}</td>
                      <td className="py-1.5 px-3 border-r border-black font-bold">{item.laundry_chemicals?.name}</td>
                      <td className="py-1.5 px-3 border-r border-black text-center font-medium">{item.laundry_chemicals?.unit}</td>
                      <td className="py-1.5 px-3 border-r border-black text-center font-extrabold">{item.quantity}</td>
                      <td className="py-1.5 px-3 border-r border-black text-right">${Number(item.unit_rate).toFixed(2)}</td>
                      <td className="py-1.5 px-3 text-right font-black">${Number(item.total_cost).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-black font-black bg-gray-50 print:bg-gray-100">
                    <td colSpan={5} className="py-2.5 px-3 text-right border-r border-black text-xs uppercase">
                      Grand Total Estimated Value:
                    </td>
                    <td className="py-2.5 px-3 text-right text-sm font-black">
                      ${Number(viewingOrder.total_amount).toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>

              {/* 2 Signature Blocks: ONLY Prepared by & Approved by */}
              <div className="grid grid-cols-2 gap-16 pt-10 border-t-2 border-gray-800 text-center text-xs pb-10">
                {/* PREPARED BY */}
                <div className="flex flex-col items-center">
                  <div className="font-bold mb-1">Prepared By:</div>
                  <div className="h-16 w-full flex items-end justify-center pb-1">
                    <div className="w-56 border-b border-black"></div>
                  </div>
                  <div className="font-extrabold text-[13px] mt-1 text-gray-900">{viewingOrder.requested_by}</div>
                  <div className="text-[10px] text-gray-500 font-medium">{viewingOrder.prepared_title || 'Housekeeping Coordinator'}</div>
                </div>

                {/* APPROVED BY */}
                <div className="flex flex-col items-center">
                  <div className="font-bold mb-1">Approved By:</div>
                  <div className="h-16 w-full flex items-end justify-center pb-1">
                    <div className="w-56 border-b border-black"></div>
                  </div>
                  <div className="font-extrabold text-[13px] mt-1 text-gray-900">{viewingOrder.approved_by || 'Aminath Nadheema'}</div>
                  <div className="text-[10px] text-gray-500 font-medium">{viewingOrder.approved_title || 'Executive Housekeeper'}</div>
                </div>
              </div>

              <div className="mt-8 pt-4 border-t border-dashed border-gray-300 text-[9.5px] text-center text-gray-400 print:text-gray-500">
                Generated via HK Pulse • Official Resort Procurement Form
              </div>

            </div>

          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT CATALOG ITEM (print:hidden applied) */}
      {showCatalogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 print:hidden">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100">
            <h3 className="text-base font-bold text-gray-900 mb-1">
              {editingChemicalId ? 'Edit Chemical Rate & Unit' : 'Add Chemical to List'}
            </h3>
            <p className="text-xs text-gray-500 mb-4">Update chemical specification and unit cost.</p>

            <form onSubmit={handleSaveCatalog} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Chemical Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. ES Detergent 20LT"
                  value={catalogForm.name}
                  onChange={e => setCatalogForm({ ...catalogForm, name: e.target.value })}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-1 focus:ring-[#6D2158] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Category</label>
                <select
                  value={catalogForm.category}
                  onChange={e => setCatalogForm({ ...catalogForm, category: e.target.value })}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-1 focus:ring-[#6D2158] focus:outline-none font-medium"
                >
                  <option value="Wash Chemical">Wash Chemical</option>
                  <option value="Bleaching">Bleaching</option>
                  <option value="Neutralizer / Sour">Neutralizer / Sour</option>
                  <option value="Softener">Softener</option>
                  <option value="Stain Remover">Stain Remover</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Packaging Unit</label>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. 20L Drum, Bottle"
                    value={catalogForm.unit}
                    onChange={e => setCatalogForm({ ...catalogForm, unit: e.target.value })}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-1 focus:ring-[#6D2158] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Standard Rate ($)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={catalogForm.unit_rate}
                    onChange={e => setCatalogForm({ ...catalogForm, unit_rate: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-bold text-emerald-700 focus:ring-1 focus:ring-[#6D2158] focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCatalogModal(false)}
                  className="px-3.5 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#6D2158] hover:bg-[#581a46] text-white rounded-lg text-xs font-bold shadow"
                >
                  Save Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* GLOBAL CSS: ABSOLUTE PRINT OVERRIDE                       */}
      {/* ========================================================= */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 0 !important;
          }

          body, html {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          aside,
          nav,
          header,
          footer,
          #sidebar,
          [class*="bottom-0"],
          [class*="MobileNav"],
          .print\\:hidden {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
          }

          .modal-print-wrapper {
            position: absolute !important;
            inset: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background: white !important;
            color: black !important;
            z-index: 9999999 !important;
            display: block !important;
            overflow: hidden !important;
          }

          table {
            font-size: 12px !important;
            width: 100% !important;
            border-collapse: collapse !important;
          }

          th {
            background-color: #f3f4f6 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          th, td {
            padding: 6px 8px !important;
          }
        }
      `}</style>
    </div>
  );
}
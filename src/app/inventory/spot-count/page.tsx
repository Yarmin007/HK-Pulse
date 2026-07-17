"use client";
import React, { useState, useEffect } from "react";
import { 
  ClipboardCheck, 
  UserCheck, 
  Calendar, 
  Plus, 
  Trash2, 
  Search, 
  Layers, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  Link2,
  Share2
} from "lucide-react";

// Mock Master Inventory Registry
const MASTER_INVENTORY_REGISTRY = [
  { id: 'mb-01', name: 'Coca Cola 325ml', category: 'Minibar', location: 'Main Store' },
  { id: 'mb-02', name: 'Tiger Beer Can', category: 'Minibar', location: 'Cold Room' },
  { id: 'ln-01', name: 'King Bed Sheet (Satin)', category: 'Linen', location: 'Laundry Hub' },
  { id: 'ln-02', name: 'Pillow Case Outer', category: 'Linen', location: 'Laundry Hub' },
  { id: 'gl-01', name: 'Hi-Ball Water Glass', category: 'Glassware', location: 'F&B Store' },
  { id: 'gl-02', name: 'Wine Glass Crystal', category: 'Glassware', location: 'F&B Store' },
  { id: 'gs-01', name: 'Luxury Shaving Kit', category: 'Guest Supplies', location: 'HK Pulse Yard' },
];

// Mock Registered Housekeeping Members & Dynamic Live Allocations
const REGISTERED_HK_STAFF = [
  { id: 'st-01', name: 'Ahmed Shaim', role: 'Villa Attendant' },
  { id: 'st-02', name: 'Ali Muaz', role: 'Villa Attendant' },
  { id: 'st-03', name: 'Hassan Moosa', role: 'Villa Attendant' },
  { id: 'st-04', name: 'Ibrahim Zayan', role: 'Ops Coordinator' },
];

const MOCK_LIVE_ALLOCATIONS: Record<string, Array<{ villaNumber: string; attendantId: string }>> = {
  "2026-07-06": [
    { villaNumber: "102", attendantId: "st-01" },
    { villaNumber: "105", attendantId: "st-01" },
    { villaNumber: "204", attendantId: "st-02" },
    { villaNumber: "208", attendantId: "st-03" },
    { villaNumber: "312", attendantId: "st-04" },
  ],
  "2026-07-07": [
    { villaNumber: "104", attendantId: "st-01" },
    { villaNumber: "202", attendantId: "st-02" },
    { villaNumber: "315", attendantId: "st-03" },
  ]
};

interface SpotCountTask {
  id: string;
  date: string;
  villaNumber: string;
  assignedTo: string;
  isExternalLink: boolean;
  externalLinkToken?: string;
  items: Array<{
    itemId: string;
    name: string;
    category: string;
    countedQty: number | null;
  }>;
  status: 'Pending' | 'In Progress' | 'Completed';
  notes: string;
}

export default function SpotCountPage() {
  const [tasks, setTasks] = useState<SpotCountTask[]>([
    {
      id: 'CNT-9821',
      date: '2026-07-06',
      villaNumber: '102',
      assignedTo: 'Ahmed Shaim',
      isExternalLink: false,
      items: [
        { itemId: 'mb-01', name: 'Coca Cola 325ml', category: 'Minibar', countedQty: 12 },
        { itemId: 'gl-01', name: 'Hi-Ball Water Glass', category: 'Glassware', countedQty: 4 }
      ],
      status: 'Completed',
      notes: 'Pantry check.'
    }
  ]);

  const [selectedDate, setSelectedDate] = useState('2026-07-06');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [autoVillaNumber, setAutoVillaNumber] = useState('');
  const [customAssignee, setCustomAssignee] = useState('');
  const [createWithLink, setCreateWithLink] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItems, setSelectedItems] = useState<Array<typeof MASTER_INVENTORY_REGISTRY[0]>>([]);
  const [taskNotes, setTaskNotes] = useState('');

  // Auto extract villa assignment matching standard HK pulse layout configurations
  useEffect(() => {
    if (selectedDate && selectedStaffId) {
      const dayAllocations = MOCK_LIVE_ALLOCATIONS[selectedDate] || [];
      const matched = dayAllocations.find(a => a.attendantId === selectedStaffId);
      if (matched) {
        setAutoVillaNumber(matched.villaNumber);
      } else {
        setAutoVillaNumber('');
      }
    } else {
      setAutoVillaNumber('');
    }
  }, [selectedDate, selectedStaffId]);

  const handleAddItem = (item: typeof MASTER_INVENTORY_REGISTRY[0]) => {
    if (selectedItems.some(i => i.id === item.id)) return;
    setSelectedItems([...selectedItems, item]);
  };

  const handleRemoveSelectedItem = (id: string) => {
    setSelectedItems(selectedItems.filter(item => item.id !== id));
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedItems.length === 0) return alert('Select items to include.');
    
    let staffName = customAssignee;
    if (createWithLink) {
      staffName = customAssignee || "External Link User";
    } else {
      const staffLookup = REGISTERED_HK_STAFF.find(s => s.id === selectedStaffId);
      if (staffLookup) staffName = staffLookup.name;
    }

    if (!staffName && !createWithLink) return alert('Assign to a registered member or use a link.');

    const newId = `CNT-${Math.floor(1000 + Math.random() * 9000)}`;
    const token = createWithLink ? `token_auth_${Math.random().toString(36).substr(2, 9)}` : undefined;

    const newTask: SpotCountTask = {
      id: newId,
      date: selectedDate,
      villaNumber: autoVillaNumber || 'N/A',
      assignedTo: staffName,
      isExternalLink: createWithLink,
      externalLinkToken: token,
      items: selectedItems.map(i => ({
        itemId: i.id,
        name: i.name,
        category: i.category,
        countedQty: null
      })),
      status: 'Pending',
      notes: taskNotes
    };

    setTasks([newTask, ...tasks]);
    setSelectedItems([]);
    setTaskNotes('');
    setSelectedStaffId('');
    setCustomAssignee('');
    setCreateWithLink(false);
  };

  const handleLiveCountUpdate = (taskId: string, itemId: string, val: number) => {
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        const updatedItems = t.items.map(item => item.itemId === itemId ? { ...item, countedQty: val } : item);
        const active = updatedItems.some(item => item.countedQty !== null);
        const complete = updatedItems.every(item => item.countedQty !== null);
        return {
          ...t,
          items: updatedItems,
          status: complete ? 'Completed' : active ? 'In Progress' : 'Pending'
        };
      }
      return t;
    }));
  };

  const filteredInventory = MASTER_INVENTORY_REGISTRY.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 bg-slate-50 min-h-screen text-slate-800">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <ClipboardCheck className="text-emerald-600 h-8 w-8" /> Inventory Spot Count
          </h1>
        </div>
        <div className="bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-200 flex items-center gap-2 text-sm font-medium text-slate-600">
          <Calendar className="h-4 w-4 text-emerald-600" />
          <span>Operational Date: 2026-07-06</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 bg-white p-6 rounded-2xl shadow-sm border border-slate-200 h-fit">
          <h2 className="text-xl font-bold text-slate-900 mb-4 border-b pb-3">Create Physical Count</h2>
          
          <form onSubmit={handleCreateTask} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
              <input 
                type="date" 
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              />
            </div>

            <div className="flex items-center gap-2 py-1">
              <input 
                type="checkbox" 
                id="externalLinkCheck"
                checked={createWithLink}
                onChange={(e) => {
                  setCreateWithLink(e.target.checked);
                  if (e.target.checked) setSelectedStaffId('');
                }}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <label htmlFor="externalLinkCheck" className="text-sm font-medium text-slate-700 flex items-center gap-1 cursor-pointer">
                <Link2 className="h-4 w-4 text-slate-500" /> Generate password-free link for outside staff
              </label>
            </div>

            {!createWithLink ? (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Registered Housekeeping Member</label>
                <select
                  value={selectedStaffId}
                  onChange={(e) => setSelectedStaffId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                >
                  <option value="">-- Select Member (Sends to Mobile app) --</option>
                  {REGISTERED_HK_STAFF.map(staff => (
                    <option key={staff.id} value={staff.id}>{staff.name} ({staff.role})</option>
                  ))}
                </select>

                {autoVillaNumber && (
                  <div className="mt-2 text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 p-2 rounded-lg font-medium">
                    ✓ Automatically extracted live allocation assignment: **Villa {autoVillaNumber}**
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">External Description / Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. F&B runner / Casual Team"
                  value={customAssignee}
                  onChange={(e) => setCustomAssignee(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Items To Count</label>
              {selectedItems.length === 0 ? (
                <p className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-lg border border-dashed border-slate-200 text-center">
                  Select items from the matrix board.
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {selectedItems.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                      <div className="flex-1 min-w-0 pr-2">
                        <p className="font-semibold text-slate-800 truncate">{item.name}</p>
                        <p className="text-slate-400 text-[10px]">{item.category}</p>
                      </div>
                      <button 
                        type="button"
                        onClick={() => handleRemoveSelectedItem(item.id)}
                        className="text-rose-500 hover:text-rose-700 p-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
              <textarea 
                rows={2}
                placeholder="Notes..."
                value={taskNotes}
                onChange={(e) => setTaskNotes(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-2 px-4 rounded-xl shadow-sm text-sm flex items-center justify-center gap-2"
            >
              <Plus className="h-4 w-4" /> Deploy Count Checklist
            </button>
          </form>
        </div>

        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col h-[600px]">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-slate-900">Inventory Registry Matrix</h2>
          </div>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search matrix registry items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm transition-all"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {filteredInventory.map(item => {
              const isSelected = selectedItems.some(i => i.id === item.id);
              return (
                <div 
                  key={item.id}
                  className={`flex justify-between items-center p-3 rounded-xl border text-sm ${
                    isSelected ? 'bg-emerald-50/60 border-emerald-300' : 'bg-white border-slate-200'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{item.name}</span>
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 tracking-wide">
                        {item.category}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Location: {item.location}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isSelected}
                    onClick={() => handleAddItem(item)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                      isSelected ? 'bg-emerald-100 text-emerald-700 cursor-not-allowed' : 'bg-slate-950 text-white hover:bg-slate-800'
                    }`}
                  >
                    {isSelected ? 'Added' : 'Select'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-8 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Real-Time Progress</h2>

        <div className="space-y-4">
          {tasks.map(task => (
            <div key={task.id} className="p-5 border border-slate-200 rounded-2xl bg-slate-50/60">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-3 mb-4 gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-xs font-bold bg-slate-200 text-slate-800 px-2 py-1 rounded">
                    {task.id}
                  </span>
                  <span className="text-xs text-slate-600 font-semibold bg-white px-2 py-1 rounded-md border border-slate-200">
                    <UserCheck className="h-3 w-3 text-emerald-600 inline mr-1" />
                    {task.assignedTo} {task.villaNumber !== 'N/A' && `(Villa: ${task.villaNumber})`}
                  </span>
                  {task.isExternalLink && (
                    <button 
                      onClick={() => alert(`Copied password-free dashboard access url: https://hkpulse.resort/shared/spot-count/${task.externalLinkToken}`)}
                      className="text-xs bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-1 rounded-md flex items-center gap-1 hover:bg-indigo-100"
                    >
                      <Share2 className="h-3 w-3" /> Copy Direct Access Link
                    </button>
                  )}
                </div>
                <div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${
                    task.status === 'Completed' ? 'bg-emerald-100 text-emerald-800' :
                    task.status === 'In Progress' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'
                  }`}>
                    {task.status}
                  </span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 font-medium">
                      <th className="pb-2">Inventory Item</th>
                      <th className="pb-2">Category</th>
                      <th className="pb-2 text-right">Physical Count Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {task.items.map(item => (
                      <tr key={item.itemId} className="text-slate-700">
                        <td className="py-2.5 font-medium text-slate-900">{item.name}</td>
                        <td className="py-2.5 text-slate-500">{item.category}</td>
                        <td className="py-2.5 text-right">
                          <input 
                            type="number"
                            value={item.countedQty ?? ''}
                            placeholder="Enter count"
                            onChange={(e) => {
                              const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                              handleLiveCountUpdate(task.id, item.itemId, val);
                            }}
                            className="w-24 px-2 py-1 border border-slate-200 rounded text-right text-xs font-bold bg-slate-50 focus:bg-white focus:ring-1 focus:ring-emerald-500"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
"use client";
import React, { useState, useEffect } from 'react';
import { 
  Search, Coffee, CheckCircle2, 
  Clock, Calendar, ArrowUpDown, Download, ClipboardList
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// --- TYPES ---
type HSKRequest = {
  id: string;
  room_number: string;
  request_type: 'Service' | 'Minibar';
  request_details: string;
  is_dispatched: boolean;
  is_posted: boolean;
  is_completed: boolean;
  created_at: string;
  // Computed fields
  status?: string; 
  attendant_name?: string;
  attendant_jetty?: string;
};

// --- HELPER: ATTENDANT ALLOCATION ---
// Automatically determines staff based on Villa Number
const getAttendantInfo = (villaStr: string) => {
  const num = parseInt(villaStr, 10);
  if (isNaN(num)) return { name: "Duty Team", jetty: "General" };

  if (num >= 1 && num <= 35) return { name: "Elena Rodriguez", jetty: "Jetty A" };
  if (num >= 37 && num <= 50) return { name: "Marcus Thorne", jetty: "Jetty B" };
  if (num >= 59 && num <= 79) return { name: "Sarah Miller", jetty: "Jetty C" };
  return { name: "David Smith", jetty: "Beach Villas" };
};

export default function RequestLog() {
  const [requests, setRequests] = useState<HSKRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // --- FILTERS ---
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);
  const [typeFilter, setTypeFilter] = useState<'All' | 'Service' | 'Minibar'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  // --- FETCH DATA ---
  useEffect(() => {
    const fetchLog = async () => {
      setIsLoading(true);
      
      // Fetch data from Supabase (ordered by newest)
      let { data, error } = await supabase
        .from('hsk_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        // Process data to add Status & Attendant info
        const enhancedData = data.map((r: any) => {
           const attendant = getAttendantInfo(r.room_number);
           let status = 'Pending';
           
           if (r.is_completed) status = 'Completed';
           else if (r.is_posted) status = 'Posted';
           else if (r.is_dispatched) status = 'Dispatched';

           return {
             ...r,
             request_type: r.request_type === 'Normal' ? 'Service' : r.request_type, // Handle legacy data
             status,
             attendant_name: attendant.name,
             attendant_jetty: attendant.jetty
           };
        });
        setRequests(enhancedData);
      }
      setIsLoading(false);
    };

    fetchLog();
  }, [dateFilter]);

  // --- SORTING & FILTERING ---
  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedRequests = React.useMemo(() => {
    let sortableItems = [...requests];
    
    // 1. FILTER
    sortableItems = sortableItems.filter(item => {
      const itemDate = item.created_at.split('T')[0];
      // Only apply date filter if user picked a date (optional: remove this check to show all history)
      const dateMatch = !dateFilter || itemDate === dateFilter;
      const typeMatch = typeFilter === 'All' || item.request_type === typeFilter;
      const searchMatch = 
        item.room_number.includes(searchQuery) || 
        item.attendant_name?.toLowerCase().includes(searchQuery.toLowerCase());

      return dateMatch && typeMatch && searchMatch;
    });

    // 2. SORT
    if (sortConfig) {
      sortableItems.sort((a: any, b: any) => {
        if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
        if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return sortableItems;
  }, [requests, sortConfig, dateFilter, typeFilter, searchQuery]);

  return (
    <div className="min-h-screen p-6 pb-20 bg-[#FDFBFD] font-antiqua text-[#6D2158]">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-end border-b border-slate-200 pb-6 gap-4">
        <div>
          <h1 className="text-4xl font-bold italic tracking-tight">Master Log</h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">
            Archive & Audit Trail
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:bg-[#6D2158] hover:text-white transition-all">
           <Download size={14} /> Export CSV
        </button>
      </div>

      {/* FILTERS */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col lg:flex-row gap-4 justify-between items-center mt-6">
        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          {/* Date Picker */}
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
             <Calendar size={14} className="text-slate-400"/>
             <input 
               type="date" 
               value={dateFilter}
               onChange={(e) => setDateFilter(e.target.value)}
               className="bg-transparent text-xs font-bold uppercase text-[#6D2158] outline-none cursor-pointer"
             />
          </div>
          
          {/* Type Tabs */}
          <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-200">
            {['All', 'Service', 'Minibar'].map((tab) => (
              <button
                key={tab}
                onClick={() => setTypeFilter(tab as any)}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                  typeFilter === tab ? 'bg-white text-[#6D2158] shadow-sm' : 'text-slate-400 hover:text-[#6D2158]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative w-full lg:w-64">
          <Search className="absolute left-3 top-2.5 text-slate-300" size={16} />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Villa or Staff..." 
            className="w-full pl-10 pr-4 py-2 text-xs font-bold border border-slate-200 rounded-xl focus:outline-none focus:border-[#6D2158] text-[#6D2158] placeholder-slate-300"
          />
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mt-6">
        <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50/50 text-[9px] uppercase tracking-[0.2em] text-slate-400 font-bold border-b border-slate-100">
              <th className="p-5 cursor-pointer hover:text-[#6D2158] transition-colors" onClick={() => handleSort('room_number')}>
                <div className="flex items-center gap-1">Villa <ArrowUpDown size={10}/></div>
              </th>
              <th className="p-5">Request Details</th>
              <th className="p-5 cursor-pointer hover:text-[#6D2158] transition-colors" onClick={() => handleSort('attendant_name')}>
                <div className="flex items-center gap-1">Allocated Staff <ArrowUpDown size={10}/></div>
              </th>
              <th className="p-5 cursor-pointer hover:text-[#6D2158] transition-colors" onClick={() => handleSort('created_at')}>
                <div className="flex items-center gap-1">Time <ArrowUpDown size={10}/></div>
              </th>
              <th className="p-5 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
               <tr><td colSpan={5} className="p-8 text-center text-slate-400 italic">Loading records...</td></tr>
            ) : sortedRequests.length === 0 ? (
               <tr><td colSpan={5} className="p-8 text-center text-slate-400 italic">No records found.</td></tr>
            ) : (
              sortedRequests.map((req) => (
              <tr key={req.id} className="hover:bg-[#6D2158]/[0.02] transition-colors group">
                
                {/* Villa */}
                <td className="p-5">
                  <span className="text-lg font-bold text-[#6D2158]">{req.room_number}</span>
                  <div className={`mt-1 text-[9px] uppercase font-bold px-2 py-0.5 rounded-md inline-block ${req.request_type === 'Minibar' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
                    {req.request_type}
                  </div>
                </td>

                {/* Details */}
                <td className="p-5 max-w-xs">
                   {req.request_type === 'Minibar' ? (
                     <div className="flex flex-wrap gap-1">
                        {req.request_details.split(', ').map((item, i) => (
                           <span key={i} className="text-[10px] font-medium px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded text-slate-600">{item}</span>
                        ))}
                     </div>
                   ) : (
                     <div className="flex items-start gap-2">
                        <ClipboardList size={14} className="text-slate-300 mt-0.5 shrink-0" />
                        <p className="text-sm font-medium text-slate-600 italic leading-snug">"{req.request_details}"</p>
                     </div>
                   )}
                </td>

                {/* Staff */}
                <td className="p-5">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-700">{req.attendant_name}</span>
                    <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">{req.attendant_jetty}</span>
                  </div>
                </td>

                {/* Time */}
                <td className="p-5">
                  <div className="text-xs font-bold text-slate-500">
                    {new Date(req.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </div>
                  <div className="text-[9px] text-slate-300 font-bold uppercase mt-0.5">
                    {new Date(req.created_at).toLocaleDateString()}
                  </div>
                </td>

                {/* Status Badge */}
                <td className="p-5 text-right">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest ${
                    req.status === 'Completed' || req.status === 'Posted' 
                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                    : req.status === 'Dispatched'
                    ? 'bg-blue-50 text-blue-600 border border-blue-100'
                    : 'bg-rose-50 text-rose-600 border border-rose-100 animate-pulse'
                  }`}>
                    {req.status === 'Completed' || req.status === 'Posted' ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                    {req.status}
                  </span>
                </td>
              </tr>
            )))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
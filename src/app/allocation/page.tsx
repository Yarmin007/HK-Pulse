"use client";
import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

// ⚡ BULLETPROOF ABSOLUTE IMPORTS
import { AREAS } from '@/app/allocation/lib/constants';
import VillaBoard from '@/app/allocation/components/VillaBoard';
import DepartmentBoard from '@/app/allocation/components/DepartmentBoard';

const getToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function AllocationPage() {
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [hosts, setHosts] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<any[]>([]);
  const [masterList, setMasterList] = useState<any[]>([]); 
  const [activeLeaves, setActiveLeaves] = useState<any[]>([]);
  const [activeArea, setActiveArea] = useState('villa');
  const [isProcessing, setIsProcessing] = useState(true);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => { fetchData(); }, [selectedDate, activeArea]);

  const fetchData = async () => {
      setIsProcessing(true);
      const { data: hostsData } = await supabase.from('hsk_hosts').select('id, full_name, host_id, role, sub_department, mvpn, personal_mobile, company_mobile, nicknames').eq('status', 'Active').order('full_name');
      if (hostsData) setHosts(hostsData);

      const { data: allocData } = await supabase.from('hsk_allocations').select('*').eq('report_date', selectedDate);
      if (allocData) setAllocations(allocData); else setAllocations([]);

      const { data: guestData } = await supabase.from('hsk_daily_summary').select('villa_number, status, arrival_time, departure_time').eq('report_date', selectedDate);
      if (guestData) setMasterList(guestData);

      const { data: leavesData } = await supabase.from('hsk_leave_requests').select('*').eq('status', 'Approved').lte('start_date', selectedDate).gte('end_date', selectedDate);
      if (leavesData) setActiveLeaves(leavesData);

      setIsDirty(false);
      setIsProcessing(false);
  };

  const handleSave = async () => {
      setIsProcessing(true);
      await supabase.from('hsk_allocations').delete().eq('report_date', selectedDate);
      if (allocations.length > 0) {
          const payload = allocations.map((a: any) => {
              const { id, ...rest } = a; 
              const cleaned = rest.task_details.split(',').filter((s: string) => s.trim() !== '').join(',');
              return { ...rest, task_details: cleaned };
          });
          const { error } = await supabase.from('hsk_allocations').insert(payload);
          if (error) toast.error("Error saving allocations: " + error.message);
          else toast.success("Allocations successfully saved!");
      } else {
          toast.success("Allocations cleared.");
      }
      setIsDirty(false);
      setIsProcessing(false);
  };

  const handleCopyYesterday = async () => {
      if (!confirm("This will pull yesterday's allocations into today. Proceed?")) return;
      setIsProcessing(true);
      const d = new Date(selectedDate);
      d.setDate(d.getDate() - 1);
      const yesterday = d.toISOString().split('T')[0];
      const { data: yesterdayAllocs } = await supabase.from('hsk_allocations').select('*').eq('report_date', yesterday);
      
      if (yesterdayAllocs && yesterdayAllocs.length > 0) {
          const newAllocs = yesterdayAllocs.map((a: any) => {
              const { id, created_at, report_date, ...rest } = a;
              return { ...rest, report_date: selectedDate };
          });
          setAllocations(newAllocs);
          setIsDirty(true);
          toast.success(`Copied ${newAllocs.length} allocations! Click Save to confirm.`);
      } else {
          toast.error("No allocations found for yesterday.");
      }
      setIsProcessing(false);
  };

  const changeDate = (days: number) => {
      if (isDirty && !confirm("You have unsaved changes. Discard them?")) return;
      const d = new Date(selectedDate);
      d.setDate(d.getDate() + days);
      setSelectedDate(d.toISOString().split('T')[0]);
  };

  return (
    <div className="min-h-screen bg-slate-100 p-2 md:p-4 pb-32">
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
          <div className="flex items-center gap-3">
              <div className="h-8 w-1 bg-[#6D2158] rounded-full shrink-0"></div>
              <div>
                  <h1 className="text-lg font-black text-slate-800">Master Allocation</h1>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                     {new Date(selectedDate).toLocaleDateString('en-GB', { dateStyle: 'full' })}
                  </p>
              </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
                  <button onClick={() => changeDate(-1)} className="p-1.5 hover:bg-white rounded-md text-slate-500"><ChevronLeft size={16}/></button>
                  <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="bg-transparent text-xs font-bold text-slate-700 outline-none px-1 cursor-pointer"/>
                  <button onClick={() => changeDate(1)} className="p-1.5 hover:bg-white rounded-md text-slate-500"><ChevronRight size={16}/></button>
              </div>
              <button onClick={handleCopyYesterday} className="bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm">Copy Yesterday</button>
              <button onClick={handleSave} disabled={isProcessing || !isDirty} className={`px-4 py-1.5 rounded-lg text-xs font-bold shadow-sm ${isDirty ? 'bg-[#6D2158] text-white hover:bg-[#5a1b49]' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
                  {isProcessing ? <Loader2 size={14} className="animate-spin inline mr-1"/> : null} Save
              </button>
          </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-1.5 flex overflow-x-auto no-scrollbar gap-1 mb-4">
          {AREAS.map(tab => (
              <button key={tab.id} onClick={() => setActiveArea(tab.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${activeArea === tab.id ? "bg-[#6D2158]/10 text-[#6D2158]" : "text-slate-500 hover:bg-slate-50"}`}>
                  <tab.icon size={14} /> {tab.label}
              </button>
          ))}
      </div>

      {activeArea === 'villa' ? (
          <VillaBoard hosts={hosts} allocations={allocations} setAllocations={setAllocations} masterList={masterList} setIsDirty={setIsDirty} selectedDate={selectedDate} activeArea={activeArea} />
      ) : (
          <DepartmentBoard hosts={hosts} allocations={allocations} setAllocations={setAllocations} activeLeaves={activeLeaves} setIsDirty={setIsDirty} selectedDate={selectedDate} activeArea={activeArea} />
      )}
    </div>
  );
}
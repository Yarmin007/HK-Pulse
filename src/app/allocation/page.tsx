"use client";
import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { projectGuestDay } from '@/lib/guestDay';
import { useConfirm } from '@/components/ConfirmProvider';
import { isSpecialTaskRow } from '@/lib/specialTasks';

// ⚡ BULLETPROOF ABSOLUTE IMPORTS
import { AREAS } from '@/app/allocation/lib/constants';
import VillaBoard from '@/app/allocation/components/VillaBoard';
import SummaryStatsBoard from '@/app/allocation/components/SummaryStatsBoard';
import PublicAreaBoard from '@/app/allocation/components/PublicAreaBoard';
import WaterRoomBoard from '@/app/allocation/components/WaterRoomBoard';
import LaundryTailorBoard from '@/app/allocation/components/LaundryTailorBoard';
import GardeningBoard from '@/app/allocation/components/GardeningBoard';
import RidersStepBoard from '@/app/allocation/components/RidersStepBoard';
import AdminOfficeBoard from '@/app/allocation/components/AdminOfficeBoard';

// Local-date arithmetic on YYYY-MM-DD (no UTC conversion, so no off-by-one days).
const shiftDate = (ymd: string, days: number) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

const getToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function AllocationPage() {
  const { confirmAction } = useConfirm();
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [hosts, setHosts] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<any[]>([]);
  const [masterList, setMasterList] = useState<any[]>([]); 
  const [prevMasterList, setPrevMasterList] = useState<any[]>([]); // yesterday's guest list, for combined statuses (DEP/TMA N, TMA/ARR…)
  const [activeLeaves, setActiveLeaves] = useState<any[]>([]);
  const [activeArea, setActiveArea] = useState('villa');
  const [isProcessing, setIsProcessing] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  // Row ids of the day as this screen last loaded/saved it: tells us if someone else saved in between
  const loadedIds = React.useRef<string>('');
  const idKey = (rows: any[] | null | undefined) => (rows || []).map((r: any) => r.id).sort().join(',');

  // Only reload when the DATE changes. Switching tabs must keep unsaved edits from other tabs.
  useEffect(() => { fetchData(); }, [selectedDate]);

  // Keep villa statuses in step with the Guest List while the board is open.
  useEffect(() => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const channel = supabase
          .channel(`alloc_guest_${selectedDate}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'hsk_daily_summary' }, () => {
              if (timer) clearTimeout(timer);
              timer = setTimeout(() => {
                  projectGuestDay(selectedDate).then(r => setMasterList(r.rows));
                  projectGuestDay(shiftDate(selectedDate, -1)).then(r => setPrevMasterList(r.rows));
              }, 800);
          })
          .subscribe();
      return () => { if (timer) clearTimeout(timer); supabase.removeChannel(channel); };
  }, [selectedDate]);

  // Warn before closing the page with unsaved changes.
  useEffect(() => {
      if (!isDirty) return;
      const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
      window.addEventListener('beforeunload', warn);
      return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  const fetchData = async () => {
      setIsProcessing(true);
      const { data: hostsData } = await supabase
        .from('hsk_hosts')
        .select('id, full_name, host_id, role, sub_department, mvpn, personal_mobile, company_mobile, nicknames')
        .eq('status', 'Active')
        .order('full_name');
      if (hostsData) setHosts(hostsData);

      const { data: allocData } = await supabase
        .from('hsk_allocations')
        .select('*')
        .eq('report_date', selectedDate);
      if (allocData) setAllocations(allocData); else setAllocations([]);
      loadedIds.current = idKey(allocData);

      // Same guest list the Guest List page shows (including days projected from the last saved day)
      const [{ rows: guestRows }, { rows: prevRows }] = await Promise.all([projectGuestDay(selectedDate), projectGuestDay(shiftDate(selectedDate, -1))]);
      setMasterList(guestRows);
      setPrevMasterList(prevRows);

      const { data: leavesData } = await supabase
        .from('hsk_leave_requests')
        .select('*')
        .eq('status', 'Approved')
        .lte('start_date', selectedDate)
        .gte('end_date', selectedDate);
      if (leavesData) setActiveLeaves(leavesData);

      setIsDirty(false);
      setIsProcessing(false);
  };

  // Insert the new rows first, and only then delete the old ones,
  // so a failed save never leaves the day empty.
  const handleSave = async () => {
      setIsProcessing(true);
      try {
          const { data: oldRows, error: readErr } = await supabase.from('hsk_allocations').select('id').eq('report_date', selectedDate);
          if (readErr) throw readErr;
          // Saving replaces the whole day. If someone else saved this day after we opened it, ask before overwriting their work.
          if (idKey(oldRows) !== loadedIds.current) {
              const ok = await confirmAction({
                  title: 'Someone else saved this day',
                  message: 'This day was saved from another screen after you opened it (for example special tasks or another area). Saving now replaces their changes with what you see here. To keep their work, cancel, reload the page and redo your changes.',
                  confirmText: 'Overwrite anyway', cancelText: 'Cancel', isDestructive: true,
              });
              if (!ok) return;
          }
          const payload = allocations.map((a: any) => {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { id, created_at, updated_at, ...rest } = a;
              const cleaned = rest.task_details ? String(rest.task_details).split(',').filter((s: string) => s.trim() !== '').join(',') : '';
              return { ...rest, report_date: selectedDate, task_details: cleaned };
          });
          let inserted: any[] = [];
          if (payload.length > 0) {
              const { data, error } = await supabase.from('hsk_allocations').insert(payload).select();
              if (error) throw error;
              inserted = data || [];
          }
          const oldIds = (oldRows || []).map((r: any) => r.id);
          if (oldIds.length > 0) {
              const { error } = await supabase.from('hsk_allocations').delete().in('id', oldIds);
              if (error) throw error;
          }
          setAllocations(inserted);
          loadedIds.current = idKey(inserted);
          setIsDirty(false);
          toast.success(payload.length ? 'Allocations saved' : 'Allocations cleared');
      } catch (err: any) {
          toast.error('Not saved: ' + (err?.message || 'unknown error') + ' — your changes are still on screen.');
      } finally {
          setIsProcessing(false);
      }
  };

  const handleCopyYesterday = async () => {
      if (!(await confirmAction({ title: 'Copy yesterday?', message: "This replaces the board with yesterday's allocations. Nothing is saved until you press Save changes.", confirmText: 'Copy yesterday', icon: 'question' }))) return;
      setIsProcessing(true);
      const yesterday = shiftDate(selectedDate, -1);
      const { data: yesterdayAllocs } = await supabase.from('hsk_allocations').select('*').eq('report_date', yesterday);
      
      if (yesterdayAllocs && yesterdayAllocs.length > 0) {
          const newAllocs = yesterdayAllocs.map((a: any) => {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { id, created_at, updated_at, report_date, ...rest } = a;
              return { ...rest, report_date: selectedDate };
          });
          // Yesterday had no special tasks → keep the ones already set for today
          if (!newAllocs.some(isSpecialTaskRow)) newAllocs.push(...allocations.filter(isSpecialTaskRow));
          setAllocations(newAllocs);
          setIsDirty(true);
          toast.success(`Copied ${newAllocs.length} allocations! Click Save to confirm.`);
      } else {
          toast.error("No allocations found for yesterday.");
      }
      setIsProcessing(false);
  };

  const goToDate = async (next: string) => {
      if (!next || next === selectedDate) return;
      if (isDirty && !(await confirmAction({ title: 'Unsaved changes', message: 'You have changes on this day that are not saved. Leave without saving them?', confirmText: 'Discard changes', cancelText: 'Stay here', isDestructive: true }))) return;
      setSelectedDate(next);
  };
  const changeDate = (days: number) => goToDate(shiftDate(selectedDate, days));

  // Safe tab identification matching exact or normalized names
  const areaKey = (activeArea || '').toLowerCase().replace(/[-_ &]/g, '');

  return (
    <div className="min-h-screen bg-slate-100 p-2 md:p-4 pb-32">
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
          <div className="flex items-center gap-3">
              <div className="h-8 w-1 bg-[#6D2158] rounded-full shrink-0"></div>
              <div>
                  <h1 className="text-lg font-black text-slate-800">Master Allocation</h1>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                     {new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-GB', { dateStyle: 'full' })}
                  </p>
              </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
                  <button onClick={() => changeDate(-1)} className="p-1.5 hover:bg-white rounded-md text-slate-500"><ChevronLeft size={16}/></button>
                  <input type="date" value={selectedDate} onChange={(e) => goToDate(e.target.value)} className="bg-transparent text-xs font-bold text-slate-700 outline-none px-1 cursor-pointer"/>
                  <button onClick={() => changeDate(1)} className="p-1.5 hover:bg-white rounded-md text-slate-500"><ChevronRight size={16}/></button>
              </div>
              <button
                  onClick={async () => {
                      const url = `${window.location.origin}/share/front-office`;
                      try { await navigator.clipboard.writeText(url); toast.success('Front Office link copied'); }
                      catch { window.prompt('Front Office link', url); }
                  }}
                  title="Public page for Front Office: today's villa attendants with photo, MVPN and personal number, plus the In-Villa Directory (PDFs)"
                  className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm">FO Link</button>
              <button onClick={handleCopyYesterday} className="bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm">Copy Yesterday</button>
              <button onClick={handleSave} disabled={isProcessing || !isDirty} className={`px-4 py-1.5 rounded-lg text-xs font-bold shadow-sm ${isDirty ? 'bg-[#6D2158] text-white hover:bg-[#5a1b49]' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
                  {isProcessing ? <Loader2 size={14} className="animate-spin inline mr-1"/> : null} {isDirty ? 'Save changes' : 'Saved'}
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

      {areaKey === 'summary' ? (
          <SummaryStatsBoard selectedDate={selectedDate} setIsDirty={setIsDirty} />
      ) : areaKey === 'villa' || areaKey === 'villaattendant' ? (
          <VillaBoard 
              hosts={hosts} 
              allocations={allocations} 
              setAllocations={setAllocations} 
              masterList={masterList} 
              prevMasterList={prevMasterList}
              setIsDirty={setIsDirty} 
              selectedDate={selectedDate} 
              activeArea={activeArea} 
          />
      ) : (areaKey.includes('public') || areaKey.includes('housemate') || areaKey === 'pa') ? (
          <PublicAreaBoard 
              hosts={hosts} 
              setHosts={setHosts} 
              allocations={allocations} 
              setAllocations={setAllocations} 
              setIsDirty={setIsDirty} 
              selectedDate={selectedDate} 
          />
      ) : (areaKey.includes('water') || areaKey.includes('pool')) ? (
          <WaterRoomBoard 
              hosts={hosts} 
              setHosts={setHosts} 
              allocations={allocations} 
              setAllocations={setAllocations} 
              setIsDirty={setIsDirty} 
              selectedDate={selectedDate} 
          />
      ) : (areaKey.includes('laundry') || areaKey.includes('tailor') || areaKey.includes('linen')) ? (
          <LaundryTailorBoard 
              hosts={hosts} 
              setHosts={setHosts} 
              allocations={allocations} 
              setAllocations={setAllocations} 
              setIsDirty={setIsDirty} 
              selectedDate={selectedDate} 
          />
      ) : (areaKey.includes('garden') || areaKey.includes('landscap')) ? (
          <GardeningBoard 
              hosts={hosts} 
              setHosts={setHosts} 
              allocations={allocations} 
              setAllocations={setAllocations} 
              setIsDirty={setIsDirty} 
              selectedDate={selectedDate} 
          />
      ) : (areaKey.includes('rider') || areaKey.includes('step') || areaKey.includes('buggy') || areaKey.includes('transport')) ? (
          <RidersStepBoard 
              hosts={hosts} 
              setHosts={setHosts} 
              allocations={allocations} 
              setAllocations={setAllocations} 
              setIsDirty={setIsDirty} 
              selectedDate={selectedDate} 
          />
      ) : (areaKey.includes('admin') || areaKey.includes('office')) ? (
          <AdminOfficeBoard 
              hosts={hosts} 
              setHosts={setHosts} 
              allocations={allocations} 
              setAllocations={setAllocations} 
              setIsDirty={setIsDirty} 
              selectedDate={selectedDate} 
          />
      ) : (
          <SummaryStatsBoard selectedDate={selectedDate} setIsDirty={setIsDirty} />
      )}
    </div>
  );
}
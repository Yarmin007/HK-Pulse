"use client";
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, Calendar, Clock, ArrowRight, ArrowLeft, 
  MinusCircle, Plus, Trash2, History, X, Save, Cloud, Loader2
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// --- TYPES ---
type Host = {
  id: string;
  full_name: string;
  host_id: string;
  role: string;
};

type Timesheet = {
  id?: string;
  host_id: string;
  date: string;
  shift_in: string;
  shift_out: string;
  shift_in_2: string;
  shift_out_2: string;
  worked_hours: number;
  daily_balance: number;
};

type Redemption = {
  id: string;
  host_id: string;
  date_taken: string;
  hours_deducted: number;
};

export default function OvertimeRegistry() {
  const [activeView, setActiveView] = useState<'Registry' | 'Sheet'>('Registry');
  const [selectedHost, setSelectedHost] = useState<Host | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  
  // Date State (Payroll Month)
  const [payrollMonth, setPayrollMonth] = useState(new Date());

  const [hosts, setHosts] = useState<Host[]>([]);
  
  // Refs for bulletproof state management
  const timesheetsRef = useRef<Timesheet[]>([]); 
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]); 

  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modals & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [hostSearch, setHostSearch] = useState('');
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyHost, setHistoryHost] = useState<any>(null);
  const [redeemData, setRedeemData] = useState({ date: '', days: 1 });

  // --- HELPERS ---
  const toLocalISOString = (date: Date) => {
    const offset = date.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(date.getTime() - offset)).toISOString().slice(0, 10);
    return localISOTime;
  };

  const getPayrollRange = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth(); 
    // Payroll: 21st Prev Month -> 20th Curr Month
    const start = new Date(year, month - 1, 21); 
    const end = new Date(year, month, 20); 
    return { start, end };
  };

  const getMonthLabel = (date: Date) => date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

  // "08" -> "08:00"
  const formatTimeInput = (val: string) => {
    if (!val) return '';
    if (/^\d{1,2}$/.test(val)) return `${val.padStart(2, '0')}:00`;
    return val;
  };

  const calculateHours = (in1: string, out1: string, in2: string, out2: string) => {
    const getMins = (t: string) => {
      if(!t) return 0;
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    let totalMins = 0;
    if(in1 && out1) totalMins += Math.max(0, getMins(out1) - getMins(in1));
    if(in2 && out2) totalMins += Math.max(0, getMins(out2) - getMins(in2));
    return Number((totalMins / 60).toFixed(2));
  };

  // --- DATA LOADING ---
  const fetchData = async () => {
    setIsLoading(true);
    const { data: h } = await supabase.from('hsk_hosts').select('*').order('full_name');
    if (h) setHosts(h);
    
    const { data: t } = await supabase.from('hsk_timesheets').select('*');
    if (t) {
       timesheetsRef.current = t; 
       setTimesheets(t);          
    }

    const { data: r } = await supabase.from('hsk_ot_redemptions').select('*');
    if (r) setRedemptions(r);
    
    setIsLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // --- REGISTRY CALCULATIONS ---
  const registryData = useMemo(() => {
    return hosts.map(host => {
      const hostSheets = timesheets.filter(t => t.host_id === host.id);
      
      const monthlyBalances: Record<string, number> = {};
      
      hostSheets.forEach(sheet => {
         const date = new Date(sheet.date);
         let pYear = date.getFullYear();
         let pMonth = date.getMonth(); 
         if (date.getDate() >= 21) {
            pMonth++; 
            if(pMonth > 11) { pMonth = 0; pYear++; }
         }
         
         const key = new Date(pYear, pMonth, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }); 
         
         if (!monthlyBalances[key]) monthlyBalances[key] = 0;
         monthlyBalances[key] += (sheet.daily_balance || 0);
      });

      // Net Calc
      let totalEarnedHours = 0;
      Object.values(monthlyBalances).forEach(balance => {
         if (balance > 0) totalEarnedHours += balance; 
      });

      const hostRedemptions = redemptions.filter(r => r.host_id === host.id);
      const totalHoursTaken = hostRedemptions.reduce((sum, r) => sum + r.hours_deducted, 0);
      
      const netHoursRemaining = totalEarnedHours - totalHoursTaken;
      const daysAvailable = netHoursRemaining / 8;

      const hasHistory = hostSheets.length > 0 || hostRedemptions.length > 0;

      return { 
          ...host, 
          netHoursRemaining, 
          daysAvailable, 
          totalEarnedHours,
          totalHoursTaken,
          monthlyBalances, 
          hasHistory 
      };
    }).filter(h => h.hasHistory); 
  }, [hosts, timesheets, redemptions]);


  // --- ROBUST SHEET UPDATER ---
  
  const handleSheetUpdate = async (dateStr: string, field: string, value: string) => {
    if (!selectedHost) return;
    setSaveStatus('saving');
    
    // 1. Local State Update
    const currentList = [...timesheetsRef.current];
    const existingIndex = currentList.findIndex(t => t.host_id === selectedHost.id && t.date === dateStr);
    
    let updatedItem: Timesheet;

    if (existingIndex > -1) {
        updatedItem = { ...currentList[existingIndex], [field]: value };
    } else {
        updatedItem = {
           host_id: selectedHost.id,
           date: dateStr,
           shift_in: '', shift_out: '', shift_in_2: '', shift_out_2: '',
           worked_hours: 0, daily_balance: -9,
           [field]: value 
        } as Timesheet;
    }

    updatedItem.worked_hours = calculateHours(updatedItem.shift_in, updatedItem.shift_out, updatedItem.shift_in_2, updatedItem.shift_out_2);
    updatedItem.daily_balance = updatedItem.worked_hours > 0 ? updatedItem.worked_hours - 9 : 0;

    if (existingIndex > -1) {
        currentList[existingIndex] = updatedItem;
    } else {
        currentList.push(updatedItem);
    }
    
    timesheetsRef.current = currentList; 
    setTimesheets(currentList);          

    // 2. Database Save (With Conflict Handling)
    const { data: savedData, error } = await supabase.from('hsk_timesheets').upsert({
       host_id: selectedHost.id,
       date: dateStr,
       shift_in: updatedItem.shift_in || null,
       shift_out: updatedItem.shift_out || null,
       shift_in_2: updatedItem.shift_in_2 || null,
       shift_out_2: updatedItem.shift_out_2 || null,
       worked_hours: updatedItem.worked_hours,
       daily_balance: updatedItem.daily_balance
    }, { onConflict: 'host_id, date' }).select().single(); // <--- CRITICAL FIX HERE

    if (error) {
       console.error("Save Error:", error.message);
       setSaveStatus('error');
    } else {
       // 3. Update Ref with the REAL ID from DB to prevent future insert attempts
       if (savedData) {
          const idx = timesheetsRef.current.findIndex(t => t.host_id === selectedHost.id && t.date === dateStr);
          if (idx > -1) {
             timesheetsRef.current[idx].id = savedData.id;
             setTimesheets([...timesheetsRef.current]);
          }
       }
       setTimeout(() => setSaveStatus('saved'), 500);
    }
  };

  // --- HANDLERS ---
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, dateStr: string, field: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = e.currentTarget.value;
      const formatted = formatTimeInput(val);
      if (val !== formatted) handleSheetUpdate(dateStr, field, formatted);

      // Tab to next input
      const form = e.currentTarget.closest('form');
      if (form) {
        const inputs = Array.from(form.querySelectorAll('input'));
        const index = inputs.indexOf(e.currentTarget as HTMLInputElement);
        if (index > -1 && index < inputs.length - 1) inputs[index + 1].focus();
      }
    }
  };

  const handleBlur = (dateStr: string, field: string, val: string) => {
      const formatted = formatTimeInput(val);
      if (val !== formatted) handleSheetUpdate(dateStr, field, formatted);
  };

  const handleRedeem = async () => {
    if(!selectedHost || !redeemData.date) return;
    await supabase.from('hsk_ot_redemptions').insert({
       host_id: selectedHost.id,
       date_taken: redeemData.date,
       hours_deducted: redeemData.days * 8, 
       notes: 'Day Off Taken'
    });
    setRedeemData({ ...redeemData, date: '' });
    fetchData(); 
  };

  const handleDeleteRedemption = async (id: string) => {
    if(!confirm("Refund this day off?")) return;
    await supabase.from('hsk_ot_redemptions').delete().eq('id', id);
    fetchData();
  };

  // --- RENDER ---
  const renderSheetRows = () => {
    const { start, end } = getPayrollRange(payrollMonth);
    const rows = [];
    let current = new Date(start);
    let monthlyTotalBalance = 0;

    const timeFields: (keyof Timesheet)[] = ['shift_in', 'shift_out', 'shift_in_2', 'shift_out_2'];

    while (current <= end) {
       const dateStr = toLocalISOString(current);
       const sheet = timesheets.find(t => t.host_id === selectedHost?.id && t.date === dateStr);
       const worked = sheet?.worked_hours || 0;
       const displayBalance = sheet ? sheet.daily_balance : 0; 
       monthlyTotalBalance += displayBalance;

       rows.push(
         <tr key={dateStr} className="hover:bg-slate-50 border-b border-slate-50 transition-colors focus-within:bg-blue-50/20">
            <td className="p-3 text-sm font-bold text-slate-600 w-32">
               {current.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
               <span className="text-xs text-slate-400 font-normal ml-2">{current.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
            </td>
            {timeFields.map((field) => (
                <td key={field} className="p-2">
                    <input 
                        type="time" 
                        className="w-20 p-1.5 border rounded-lg text-xs font-bold bg-white focus:border-[#6D2158] focus:ring-2 focus:ring-[#6D2158]/10 outline-none transition-all"
                        value={(sheet as any)?.[field] || ''}
                        onBlur={(e) => handleBlur(dateStr, field, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, dateStr, field)}
                        onChange={(e) => handleSheetUpdate(dateStr, field, e.target.value)}
                    />
                </td>
            ))}
            <td className="p-3 text-center font-bold text-slate-700">{worked > 0 ? worked.toFixed(2) : '-'}</td>
            <td className="p-3 text-center">
               {displayBalance !== 0 && (
                 <span className={`px-2 py-1 rounded text-xs font-bold ${displayBalance > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                    {displayBalance > 0 ? '+' : ''}{displayBalance.toFixed(2)}
                 </span>
               )}
            </td>
         </tr>
       );
       current.setDate(current.getDate() + 1);
    }
    return { rows, monthlyTotalBalance };
  };

  const modalFilteredHosts = hosts.filter(h => 
    h.full_name.toLowerCase().includes(hostSearch.toLowerCase()) || h.host_id.includes(hostSearch)
  ).slice(0, 5);

  return (
    <div className="min-h-screen p-6 pb-20 bg-[#FDFBFD] font-antiqua text-[#6D2158]">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-end border-b border-slate-200 pb-6 gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Overtime Registry</h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">Payroll Period: 21st - 20th</p>
        </div>
        
        {activeView === 'Sheet' ? (
           <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
                  {saveStatus === 'saving' && <span className="text-slate-400 flex gap-1"><Loader2 className="animate-spin" size={14}/> Saving...</span>}
                  {saveStatus === 'saved' && <span className="text-emerald-600 flex gap-1"><Cloud size={14}/> Saved</span>}
                  {saveStatus === 'error' && <span className="text-rose-600 flex gap-1"><X size={14}/> Error</span>}
              </div>
              <button onClick={() => { setActiveView('Registry'); setSaveStatus('idle'); }} className="px-6 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold uppercase hover:bg-slate-200">Back</button>
           </div>
        ) : (
           <button onClick={() => setIsLogModalOpen(true)} className="flex items-center gap-2 px-6 py-2 bg-[#6D2158] text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg hover:shadow-[#6D2158]/40">
              <Plus size={16}/> Log Overtime
           </button>
        )}
      </div>

      {/* --- VIEW 1: REGISTRY (LIST VIEW) --- */}
      {activeView === 'Registry' && (
        <div className="mt-6 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
           <div className="bg-slate-50 p-4 border-b border-slate-100 flex items-center gap-4">
              <Search className="text-slate-300" size={16}/>
              <input type="text" placeholder="Search in Registry..." className="bg-transparent outline-none text-xs font-bold w-full" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}/>
           </div>
           <table className="w-full text-left">
              <thead>
                 <tr className="bg-white text-[10px] uppercase tracking-widest text-slate-400 font-bold border-b border-slate-100">
                    <th className="p-4">Staff</th>
                    <th className="p-4 text-center">Net Days Avail</th>
                    <th className="p-4 text-center text-emerald-600">Total Earned</th>
                    <th className="p-4 text-center text-rose-600">Total Taken</th>
                    <th className="p-4 text-right">Prev Month</th>
                    <th className="p-4 text-right">Curr Month</th>
                    <th className="p-4 text-right">History</th>
                    <th className="p-4 text-right">Action</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                 {registryData.filter(h => h.full_name.toLowerCase().includes(searchQuery.toLowerCase())).map(host => {
                       const currKey = new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
                       const d = new Date(); d.setMonth(d.getMonth()-1);
                       const prevKey = d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
                       return (
                        <tr key={host.id} className="hover:bg-slate-50 transition-colors">
                           <td className="p-4">
                              <span className="block text-sm font-bold text-slate-800">{host.full_name}</span>
                              <span className="text-[10px] font-bold text-slate-400 uppercase">{host.host_id} • {host.role}</span>
                           </td>
                           <td className="p-4 text-center">
                              <span className="px-3 py-1 bg-[#6D2158]/10 text-[#6D2158] rounded-lg font-bold text-sm">
                                 {host.daysAvailable.toFixed(2)} Days
                              </span>
                           </td>
                           <td className="p-4 text-center text-xs font-bold text-emerald-600">{host.totalEarnedHours.toFixed(2)}</td>
                           <td className="p-4 text-center text-xs font-bold text-rose-500">{host.totalHoursTaken.toFixed(2)}</td>
                           <td className="p-4 text-right text-xs font-bold text-slate-500">{host.monthlyBalances[prevKey] ? `${host.monthlyBalances[prevKey].toFixed(2)}` : '-'}</td>
                           <td className="p-4 text-right text-xs font-bold text-slate-800">{host.monthlyBalances[currKey] ? `${host.monthlyBalances[currKey].toFixed(2)}` : '-'}</td>
                           <td className="p-4 text-right flex justify-end gap-2">
                              <button onClick={() => { setHistoryHost(host); setIsHistoryModalOpen(true); }} className="p-2 text-slate-400 hover:text-[#6D2158]" title="View History"><History size={16}/></button>
                              <button onClick={() => { setSelectedHost(host); setActiveView('Sheet'); }} className="p-2 bg-white border border-slate-200 rounded-lg hover:border-[#6D2158] text-slate-500 hover:text-[#6D2158]" title="Open Timesheet"><Calendar size={14}/></button>
                           </td>
                        </tr>
                       );
                    })}
              </tbody>
           </table>
        </div>
      )}

      {/* --- VIEW 2: INDIVIDUAL SHEET --- */}
      {activeView === 'Sheet' && selectedHost && (
         <div className="mt-6 flex flex-col xl:flex-row gap-6 animate-in slide-in-from-right-10 duration-300">
            <div className="flex-1">
               <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-100 mb-6">
                  <div className="flex items-center gap-4">
                     <div className="w-12 h-12 bg-[#6D2158] rounded-full flex items-center justify-center text-white font-bold text-lg">{selectedHost.full_name.charAt(0)}</div>
                     <div><h2 className="text-xl font-bold text-slate-800">{selectedHost.full_name}</h2><p className="text-xs font-bold text-slate-400 uppercase">SSL: {selectedHost.host_id}</p></div>
                  </div>
                  <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-xl border border-slate-200 mt-4 md:mt-0">
                     <button onClick={() => { const d = new Date(payrollMonth); d.setMonth(d.getMonth()-1); setPayrollMonth(d); }} className="p-2 hover:bg-white rounded-lg transition-colors"><ArrowLeft size={16} className="text-slate-500"/></button>
                     <span className="text-sm font-bold text-[#6D2158] min-w-[140px] text-center">{getMonthLabel(payrollMonth)} Payroll</span>
                     <button onClick={() => { const d = new Date(payrollMonth); d.setMonth(d.getMonth()+1); setPayrollMonth(d); }} className="p-2 hover:bg-white rounded-lg transition-colors"><ArrowRight size={16} className="text-slate-500"/></button>
                  </div>
               </div>
               <form className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                  <table className="w-full text-left">
                     <thead>
                        <tr className="bg-slate-50 text-[10px] uppercase tracking-widest text-slate-500 font-bold border-b border-slate-200">
                           <th className="p-3">Date</th><th className="p-3 w-24">In</th><th className="p-3 w-24">Out</th><th className="p-3 w-24">In (PM)</th><th className="p-3 w-24">Out (PM)</th><th className="p-3 text-center">Hrs</th><th className="p-3 text-center">Bal</th>
                        </tr>
                     </thead>
                     <tbody>
                        {(() => {
                           const { rows, monthlyTotalBalance } = renderSheetRows();
                           return (
                              <>
                                 {rows}
                                 <tr className="bg-[#6D2158]/5 border-t-2 border-[#6D2158]/10"><td colSpan={6} className="p-4 text-right text-sm font-bold text-[#6D2158] uppercase tracking-widest">Monthly Net Balance</td><td className="p-4 text-center"><span className={`text-lg font-bold ${monthlyTotalBalance > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{monthlyTotalBalance > 0 ? '+' : ''}{monthlyTotalBalance.toFixed(2)}</span></td></tr>
                              </>
                           );
                        })()}
                     </tbody>
                  </table>
               </form>
            </div>
            <div className="w-full xl:w-80 space-y-6">
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                    <h3 className="text-sm font-bold text-[#6D2158] uppercase tracking-widest mb-4">Redeem Day Off</h3>
                    <div className="space-y-3">
                       <div><label className="text-[10px] font-bold text-slate-400 uppercase">Date</label><input type="date" className="w-full p-2 border rounded-xl font-bold text-sm" value={redeemData.date} onChange={e => setRedeemData({...redeemData, date: e.target.value})} /></div>
                       <div><label className="text-[10px] font-bold text-slate-400 uppercase">Count</label><select className="w-full p-2 border rounded-xl font-bold text-sm bg-white" value={redeemData.days} onChange={e => setRedeemData({...redeemData, days: Number(e.target.value)})}>
                        <option value="1">1 Day</option><option value="0.5">0.5 Day</option><option value="2">2 Days</option></select></div>
                       <button onClick={handleRedeem} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold uppercase text-xs shadow-lg">Confirm Taken</button>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                    <h3 className="text-sm font-bold text-slate-600 uppercase tracking-widest mb-4">History</h3>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {redemptions.filter(r => r.host_id === selectedHost.id).length === 0 && <p className="text-xs italic text-slate-400">No days taken yet.</p>}
                        {redemptions.filter(r => r.host_id === selectedHost.id).map(rec => (
                           <div key={rec.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100 group">
                              <div><p className="text-xs font-bold text-slate-700">{new Date(rec.date_taken).toLocaleDateString()}</p><p className="text-[10px] font-bold text-rose-500">-{rec.hours_deducted/8} Day(s)</p></div>
                              <button onClick={() => handleDeleteRedemption(rec.id)} className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14}/></button>
                           </div>
                        ))}
                    </div>
                </div>
            </div>
         </div>
      )}

      {/* --- MODALS --- */}
      {isLogModalOpen && <div className="fixed inset-0 bg-[#6D2158]/20 backdrop-blur-sm z-50 flex items-center justify-center p-4"><div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-6 relative"><button onClick={() => setIsLogModalOpen(false)} className="absolute top-4 right-4 text-slate-300 hover:text-rose-500"><X size={20}/></button><h3 className="text-lg font-bold text-[#6D2158] mb-4">Select Staff</h3><input type="text" placeholder="Search..." autoFocus className="w-full p-4 border rounded-xl font-bold text-sm bg-slate-50 focus:border-[#6D2158] outline-none" value={hostSearch} onChange={e => setHostSearch(e.target.value)} /><div className="mt-4 space-y-2 max-h-60 overflow-y-auto">{modalFilteredHosts.map(h => (<div key={h.id} onClick={() => { setSelectedHost(h); setIsLogModalOpen(false); setHostSearch(''); setActiveView('Sheet'); }} className="p-3 border rounded-xl hover:bg-slate-50 cursor-pointer flex justify-between items-center group"><div><p className="text-sm font-bold text-slate-700">{h.full_name}</p><p className="text-[10px] text-slate-400 font-bold">{h.host_id}</p></div><ArrowRight size={16} className="text-slate-300 group-hover:text-[#6D2158]"/></div>))}</div></div></div>}
      
      {isHistoryModalOpen && historyHost && <div className="fixed inset-0 bg-[#6D2158]/20 backdrop-blur-sm z-50 flex items-center justify-center p-4"><div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6 relative"><button onClick={() => setIsHistoryModalOpen(false)} className="absolute top-4 right-4 text-slate-300 hover:text-rose-500"><X size={20}/></button><h3 className="text-lg font-bold text-[#6D2158] mb-4">{historyHost.full_name}</h3><div className="space-y-2 max-h-80 overflow-y-auto">{Object.entries(historyHost.monthlyBalances).map(([month, val]: any) => (<div key={month} className="flex justify-between p-3 border-b border-slate-50"><span className="text-sm font-bold text-slate-600">{month}</span><span className={`text-sm font-bold ${val > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{val > 0 ? '+' : ''}{val.toFixed(2)} Hrs</span></div>))}</div></div></div>}
    </div>
  );
}
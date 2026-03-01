"use client";
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Search, Wand2, Loader2, UserCheck, 
  ChevronLeft, ChevronRight, Save, X, Calendar as CalIcon
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { 
  eachDayOfInterval, format, differenceInDays, parseISO, isAfter, isBefore 
} from 'date-fns';
import toast from 'react-hot-toast';

// --- CONFIG ---
const STATUS_CODES = ['P', 'O', 'AL', 'PH', 'RR', 'SL', 'NP', 'A', 'CL', 'PA', 'MA', 'EL', 'OT'];

const STATUS_COLORS: Record<string, string> = {
  'P': 'bg-slate-50 text-slate-700',
  'OT': 'bg-slate-100 text-slate-800 font-black',
  'O': 'bg-emerald-100 text-emerald-700 font-black',
  'AL': 'bg-cyan-100 text-cyan-700 font-black', 
  'PH': 'bg-blue-100 text-blue-700 font-black', 
  'RR': 'bg-fuchsia-100 text-fuchsia-700 font-black',
  'SL': 'bg-rose-100 text-rose-700 font-black',
  'NP': 'bg-rose-200 text-rose-800 font-black',
  'A': 'bg-red-500 text-white font-black',
  'CL': 'bg-amber-100 text-amber-700 font-black',
  'PA': 'bg-teal-100 text-teal-700 font-black',
  'MA': 'bg-pink-100 text-pink-700 font-black',
  'EL': 'bg-orange-100 text-orange-700 font-black',
};

// --- OPTIMIZED CELL COMPONENT ---
type AttendanceCellProps = {
    initialVal: string;
    hostId: string;
    dateStr: string;
    isFriday: boolean;
    onSave: (hostId: string, dateStr: string, newStatus: string) => void;
};

const AttendanceCell = React.memo(({ initialVal, hostId, dateStr, isFriday, onSave }: AttendanceCellProps) => {
    const [isEditing, setIsEditing] = useState(false);
    const [val, setVal] = useState(initialVal);

    useEffect(() => { setVal(initialVal); }, [initialVal]);

    const handleChange = (newVal: string) => {
        setVal(newVal);
        setIsEditing(false);
        if (newVal !== initialVal) onSave(hostId, dateStr, newVal);
    };

    const colorClass = val ? STATUS_COLORS[val] : 'text-slate-300';
    const bgBase = isFriday ? 'bg-rose-50/30' : 'bg-white';

    if (isEditing) {
        return (
            <td className="border-b border-r border-slate-200 p-0 h-8 w-8 min-w-[32px] max-w-[32px] align-middle box-border">
                <select 
                    autoFocus
                    onBlur={() => setIsEditing(false)}
                    className={`w-full h-full appearance-none outline-none text-center text-[10px] font-bold cursor-pointer ${colorClass}`}
                    value={val}
                    onChange={(e) => handleChange(e.target.value)}
                >
                    <option value="" className="bg-white text-slate-400">-</option>
                    {STATUS_CODES.map(c => <option key={c} value={c} className="bg-white text-slate-800">{c}</option>)}
                </select>
            </td>
        );
    }

    return (
        <td 
            onClick={() => setIsEditing(true)}
            className={`border-b border-r border-slate-200 p-0 h-8 w-8 min-w-[32px] max-w-[32px] align-middle cursor-pointer hover:bg-blue-50 transition-colors box-border ${val ? colorClass : bgBase}`}
        >
            <div className="w-full h-full flex items-center justify-center text-[10px] font-bold">
                {val || '-'}
            </div>
        </td>
    );
});
AttendanceCell.displayName = 'AttendanceCell';


export default function AttendancePage() {
  const [isLoading, setIsLoading] = useState(true);
  
  // NEW: Precise Date Cutoff System
  const [cutoffDate, setCutoffDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  
  // Data
  const [hosts, setHosts] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Magic Paste State
  const [isMagicOpen, setIsMagicOpen] = useState(false);
  const [magicText, setMagicText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [magicResults, setMagicResults] = useState<any>(null);

  useEffect(() => { fetchData(); }, [selectedYear]);

  const fetchData = async () => {
    setIsLoading(true);
    
    const { data: hostData } = await supabase.from('hsk_hosts').select('*').neq('status', 'Resigned');
    
    if (hostData) {
        // --- CUSTOM HOST SORTING LOGIC ---
        const getDeptRank = (role: string, hostId: string) => {
            const r = (role || '').toLowerCase();
            const id = (hostId || '').toLowerCase();
            if (id.includes('tf') || id.includes('int') || r.includes('task force') || r.includes('intern')) return 9;
            if (r.includes('admin') || r.includes('exec') || r.includes('manager') || r.includes('coordinator') || r.includes('supervisor') || r.includes('clerk') || r.includes('secretary')) return 1;
            if (r.includes('villa') || r.includes('hk att') || r.includes('room att')) return 2;
            if (r.includes('public') || r.includes('pa ')) return 3;
            if (r.includes('pool')) return 4;
            if (r.includes('laundry') || r.includes('valet') || r.includes('presser') || r.includes('linen')) return 5;
            if (r.includes('runner')) return 6;
            if (r.includes('luggage') || r.includes('bell') || r.includes('porter')) return 7;
            if (r.includes('tailor') || r.includes('seamstress') || r.includes('upholstery')) return 8;
            if (r.includes('garden') || r.includes('landscap') || r.includes('botanist')) return 10;
            return 11;
        };

        const getSeniorityRank = (level: string, role: string) => {
            if (level === 'DA') return 1;
            if (level === 'DB') return 2;
            const r = (role || '').toLowerCase();
            if (r.includes('senior')) return 3;
            return 4;
        };

        const getHostNumber = (hostId: string) => {
            const match = String(hostId).match(/\d+/);
            return match ? parseInt(match[0], 10) : 999999;
        };

        const sortedHosts = hostData.sort((a, b) => {
            // 1. Dept Hierarchy
            const deptA = getDeptRank(a.role, a.host_id);
            const deptB = getDeptRank(b.role, b.host_id);
            if (deptA !== deptB) return deptA - deptB;

            // 2. Seniority within Dept
            const senA = getSeniorityRank(a.host_level, a.role);
            const senB = getSeniorityRank(b.host_level, b.role);
            if (senA !== senB) return senA - senB;

            // 3. Lowest SSL code
            return getHostNumber(a.host_id) - getHostNumber(b.host_id);
        });

        setHosts(sortedHosts);
    }

    const { data: attData } = await supabase.from('hsk_attendance').select('*');
    if (attData) setAttendance(attData);

    setIsLoading(false);
  };

  // --- AUTOMATED MATH ENGINE (Now strictly uses Cutoff Date) ---
  const hostBalances = useMemo(() => {
    const targetDate = parseISO(cutoffDate);
    const SYSTEM_START_DATE = new Date(2026, 0, 1); // Ground Zero for system accruals
    
    return hosts.map(host => {
      // DB Baseline (Represents absolute balance on Jan 1, 2026)
      const baseCfOff = host.cf_off || 0;
      const baseCfAL = host.cf_al || 0;
      const baseCfPH = host.cf_ph || 0;

      const joinDate = host.joining_date ? parseISO(host.joining_date) : SYSTEM_START_DATE;
      const isExec = ['DA', 'DB'].includes(host.host_level);

      const hostRecords = attendance.filter(a => a.host_id === host.host_id);
      
      // Filter out ANY records that occur AFTER our exact chosen cutoff date
      const recordsUpToTarget = hostRecords.filter(a => {
          const d = parseISO(a.date);
          return d >= SYSTEM_START_DATE && d <= targetDate;
      });

      const accrualStart = isAfter(joinDate, SYSTEM_START_DATE) ? joinDate : SYSTEM_START_DATE;
      
      let earnedOff = 0;
      let earnedAL = 0;

      // Only accrue days if the cutoff date is actually after they joined
      if (targetDate >= accrualStart) {
          const daysActive = differenceInDays(targetDate, accrualStart) + 1;
          const penaltyDays = recordsUpToTarget.filter(a => ['SL', 'NP', 'A'].includes(a.status_code)).length;
          const eligibleDays = Math.max(0, daysActive - penaltyDays);
          
          earnedOff = eligibleDays / 7;
          earnedAL = eligibleDays / 12;
      }

      // Tally Taken Leaves up to cutoff
      const takenOff = recordsUpToTarget.filter(a => a.status_code === 'O').length;
      const takenAL = recordsUpToTarget.filter(a => a.status_code === 'AL').length;
      const takenPH = recordsUpToTarget.filter(a => a.status_code === 'PH').length;

      // Fixed Quotas (Reset on Anniversary before Cutoff)
      let lastAnniversary = new Date(joinDate);
      lastAnniversary.setFullYear(targetDate.getFullYear());
      if (isAfter(lastAnniversary, targetDate)) {
          lastAnniversary.setFullYear(targetDate.getFullYear() - 1);
      }
      
      const recordsSinceAnniversary = hostRecords.filter(a => {
          const d = parseISO(a.date);
          return d >= lastAnniversary && d <= targetDate;
      });
      
      const takenSL = recordsSinceAnniversary.filter(a => a.status_code === 'SL').length;
      const takenEL = recordsSinceAnniversary.filter(a => a.status_code === 'EL').length;
      const takenRR = recordsSinceAnniversary.filter(a => a.status_code === 'RR').length;

      // Final Math Calculations
      const balOffVal = baseCfOff + earnedOff - takenOff;
      const balALVal = baseCfAL + earnedAL - takenAL;
      const balPHVal = baseCfPH - takenPH;
      const balRRVal = isExec ? 7 - takenRR : 0;
      const totalBal = balOffVal + balALVal + balPHVal + balRRVal;

      return {
        ...host,
        balOff: balOffVal.toFixed(1),
        balAL: balALVal.toFixed(1),
        balPH: balPHVal.toFixed(1),
        balRR: isExec ? balRRVal.toString() : '-',
        balTotal: totalBal.toFixed(1),
        balSL: 30 - takenSL,
        balEL: 10 - takenEL
      };
    });
  }, [hosts, attendance, cutoffDate]);

  // --- GRID SETUP ---
  const daysInYear = useMemo(() => {
    return eachDayOfInterval({
      start: new Date(selectedYear, 0, 1),
      end: new Date(selectedYear, 11, 31)
    });
  }, [selectedYear]);

  const monthsInYear = useMemo(() => {
      const months = [];
      for (let i = 0; i < 12; i++) {
          const date = new Date(selectedYear, i, 1);
          months.push({
              name: format(date, 'MMMM'),
              days: new Date(selectedYear, i + 1, 0).getDate()
          });
      }
      return months;
  }, [selectedYear]);

  // --- HANDLERS ---
  const handleCutoffChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newDateStr = e.target.value;
      if (!newDateStr) return;
      setCutoffDate(newDateStr);
      // Automatically jump the grid to the year of the cutoff date
      setSelectedYear(parseInt(newDateStr.split('-')[0], 10));
  };

  const handleYearChange = (delta: number) => {
      const newYear = selectedYear + delta;
      setSelectedYear(newYear);
      // Auto update cutoff date to Dec 31 of the selected year (or today if current year)
      const thisYear = new Date().getFullYear();
      if (newYear === thisYear) {
          setCutoffDate(format(new Date(), 'yyyy-MM-dd'));
      } else {
          setCutoffDate(`${newYear}-12-31`);
      }
  };

  const handleStatusChange = useCallback(async (hostId: string, dateStr: string, newStatus: string) => {
    const existingIdx = attendance.findIndex(a => a.host_id === hostId && a.date === dateStr);
    const newAtt = [...attendance];
    
    let error;
    if (newStatus === '') {
        if (existingIdx > -1) newAtt.splice(existingIdx, 1);
        const res = await supabase.from('hsk_attendance').delete().match({ host_id: hostId, date: dateStr });
        error = res.error;
    } else {
        if (existingIdx > -1) {
            newAtt[existingIdx] = { ...newAtt[existingIdx], status_code: newStatus };
        } else {
            newAtt.push({ host_id: hostId, date: dateStr, status_code: newStatus });
        }
        const res = await supabase.from('hsk_attendance').upsert({ host_id: hostId, date: dateStr, status_code: newStatus }, { onConflict: 'host_id, date' });
        error = res.error;
    }
    
    if (error) toast.error('Failed to save status');
    else toast.success('Saved');
    
    setAttendance(newAtt);
  }, [attendance]);

  const handleCfChange = async (hostId: string, field: string, val: number | '') => {
    const numericVal = val === '' ? 0 : val;
    setHosts(prev => prev.map(h => h.host_id === hostId ? { ...h, [field]: numericVal } : h));
    const { error } = await supabase.from('hsk_hosts').update({ [field]: numericVal }).eq('host_id', hostId);
    if (error) toast.error(`Error saving carried forward balance: ${error.message}`);
    else toast.success('CF Balance Updated');
  };

  const handleMagicParse = async () => {
    if (!magicText.trim()) return;
    setIsParsing(true);
    try {
        const res = await fetch('/api/magic-roster', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: magicText, date: `${selectedYear}-01-01` })
        });
        
        if (!res.ok) throw new Error("API Error");
        const data = await res.json();
        setMagicResults(data);
        toast.success("Parsed successfully!");
    } catch (err) {
        toast.error("Failed to parse message.");
    }
    setIsParsing(false);
  };

  const handleMagicSave = async () => {
    if (!magicResults || !magicResults.records) return;
    setIsParsing(true);
    
    const payload = magicResults.records.map((r: any) => ({
        host_id: r.host_id,
        date: magicResults.date,
        status_code: r.status_code,
        shift_note: r.shift_note || ''
    }));

    const { error } = await supabase.from('hsk_attendance').upsert(payload, { onConflict: 'host_id, date' });
    
    setIsParsing(false);
    if (error) {
        toast.error("Error saving roster: " + error.message);
    } else {
        toast.success("Roster Applied!");
        setIsMagicOpen(false);
        setMagicText('');
        setMagicResults(null);
        fetchData();
    }
  };

  const filteredHosts = hostBalances.filter(h => h.full_name.toLowerCase().includes(searchQuery.toLowerCase()) || h.host_id.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="absolute inset-0 md:left-64 pt-16 md:pt-0 flex flex-col bg-[#FDFBFD] font-sans text-slate-800 overflow-hidden">
      
      {/* HEADER */}
      <div className="flex-none flex flex-col xl:flex-row justify-between items-center bg-white border-b border-slate-200 px-6 py-4 z-10 shadow-sm gap-4">
        <div className="flex items-center gap-3 w-full xl:w-auto">
          <div className="bg-[#6D2158]/10 p-2.5 rounded-xl text-[#6D2158] hidden md:block">
             <UserCheck size={22} />
          </div>
          <div>
            <h1 className="text-xl font-black text-[#6D2158] uppercase tracking-tight">Attendance & Balances</h1>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center justify-end gap-3 w-full xl:w-auto">
            {/* NEW: Exact Date Cutoff Picker */}
            <div className="flex items-center bg-purple-50 p-1.5 rounded-xl border border-purple-200 shadow-inner">
                <span className="text-[10px] font-bold text-purple-800 uppercase tracking-widest pl-2 pr-1 hidden sm:inline">Balances As Of:</span>
                <input 
                    type="date" 
                    className="bg-transparent font-black text-sm text-[#6D2158] outline-none cursor-pointer px-2"
                    value={cutoffDate}
                    onChange={handleCutoffChange}
                />
            </div>

            {/* Year Navigator for the Grid */}
            <div className="flex items-center bg-slate-50 p-1.5 rounded-xl border border-slate-200 shadow-inner">
                <button onClick={() => handleYearChange(-1)} className="p-1.5 hover:bg-white rounded-lg text-slate-500"><ChevronLeft size={16}/></button>
                <div className="w-20 text-center font-black text-sm text-[#6D2158] tracking-widest">{selectedYear}</div>
                <button onClick={() => handleYearChange(1)} className="p-1.5 hover:bg-white rounded-lg text-slate-500"><ChevronRight size={16}/></button>
            </div>

            <div className="relative flex-1 sm:w-48">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={14}/>
                <input type="text" placeholder="Search Host..." className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl font-bold text-xs bg-slate-50 focus:bg-white focus:border-[#6D2158] outline-none transition-all shadow-inner" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>

            <button onClick={() => setIsMagicOpen(true)} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-md hover:bg-emerald-700 transition-all">
                <Wand2 size={14}/> Magic Paste
            </button>
        </div>
      </div>

      {/* SPREADSHEET AREA */}
      <div className="flex-1 p-4 flex flex-col relative overflow-hidden bg-slate-100">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex-1 overflow-hidden flex flex-col relative">
              {isLoading ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                      <Loader2 size={32} className="animate-spin text-[#6D2158] mb-4"/>
                      <span className="font-bold tracking-widest uppercase text-xs">Loading Roster...</span>
                  </div>
              ) : (
                  <div className="overflow-auto flex-1 custom-scrollbar w-full relative">
                      <table className="w-max border-separate border-spacing-0 text-[10px] whitespace-nowrap bg-white table-fixed">
                          <thead className="sticky top-0 z-[70] bg-white shadow-sm">
                              {/* ROW 1: MASTER HEADERS */}
                              <tr>
                                  <th rowSpan={3} className="max-md:static md:sticky md:left-0 z-[80] bg-slate-100 border-b-2 border-r border-slate-300 p-2 text-center w-[40px] min-w-[40px] max-w-[40px] box-border text-slate-400">#</th>
                                  <th rowSpan={3} className="max-md:static md:sticky md:left-[40px] z-[80] bg-slate-100 border-b-2 border-r border-slate-300 p-3 text-left w-[240px] min-w-[240px] max-w-[240px] box-border">
                                      <span className="block font-black uppercase text-slate-500 tracking-widest">Host Name</span>
                                      <span className="block text-[8px] font-bold text-slate-400 mt-1">ID, Role & Joined Date</span>
                                  </th>
                                  <th colSpan={5} className="max-md:static md:sticky md:left-[280px] z-[80] bg-slate-50 border-b border-r-2 border-slate-300 p-2 text-center font-black uppercase text-[#6D2158] tracking-widest shadow-[2px_0_5px_rgba(0,0,0,0.1)] w-[210px] min-w-[210px] max-w-[210px] box-border">
                                      Live Owed Balances
                                  </th>
                                  
                                  {/* Months Headers */}
                                  {monthsInYear.map(m => (
                                      <th key={m.name} colSpan={m.days} className="bg-slate-100 border-b border-r border-slate-300 p-1 text-center font-bold text-slate-600 uppercase tracking-widest box-border">{m.name}</th>
                                  ))}

                                  {/* Fixed Leaves Header */}
                                  <th colSpan={2} rowSpan={2} className="bg-slate-100 border-b border-r-2 border-slate-300 p-2 text-center font-black uppercase text-slate-500 tracking-widest box-border">
                                      Fixed Leaves
                                  </th>

                                  {/* Carried Forward Header */}
                                  <th colSpan={3} rowSpan={2} className="bg-slate-100 border-b border-l-2 border-slate-300 p-2 text-center font-black uppercase text-slate-500 tracking-widest box-border">
                                      DB Baseline CF
                                  </th>
                              </tr>

                              {/* ROW 2: SUB HEADERS */}
                              <tr>
                                  <th rowSpan={2} className="max-md:static md:sticky md:left-[280px] z-[80] bg-emerald-50 border-b-2 border-r border-slate-300 p-1 text-center font-bold text-emerald-700 w-[40px] min-w-[40px] max-w-[40px] box-border" title="Off Days">OFF</th>
                                  <th rowSpan={2} className="max-md:static md:sticky md:left-[320px] z-[80] bg-cyan-50 border-b-2 border-r border-slate-300 p-1 text-center font-bold text-cyan-700 w-[40px] min-w-[40px] max-w-[40px] box-border" title="Annual Leave">AL</th>
                                  <th rowSpan={2} className="max-md:static md:sticky md:left-[360px] z-[80] bg-blue-50 border-b-2 border-r border-slate-300 p-1 text-center font-bold text-blue-700 w-[40px] min-w-[40px] max-w-[40px] box-border" title="Public Holiday">PH</th>
                                  <th rowSpan={2} className="max-md:static md:sticky md:left-[400px] z-[80] bg-fuchsia-50 border-b-2 border-r border-slate-300 p-1 text-center font-bold text-fuchsia-700 w-[40px] min-w-[40px] max-w-[40px] box-border" title="Rest & Recreation (DA/DB Only)">RR</th>
                                  {/* 100% Solid opacity total column requested */}
                                  <th rowSpan={2} className="max-md:static md:sticky md:left-[440px] z-[80] bg-purple-100 border-b-2 border-r-2 border-slate-300 p-1 text-center font-black text-purple-900 w-[50px] min-w-[50px] max-w-[50px] box-border shadow-[2px_0_5px_rgba(0,0,0,0.1)]" title="Total Balance">TOT</th>
                                  
                                  {/* Days of Week */}
                                  {daysInYear.map((d, i) => (
                                      <th key={i} className={`p-1 text-center border-b border-r border-slate-200 text-[8px] font-bold uppercase box-border ${format(d, 'E') === 'Fri' ? 'bg-rose-50 text-rose-500' : 'bg-slate-50 text-slate-400'}`}>
                                          {format(d, 'eeeee')}
                                      </th>
                                  ))}
                              </tr>

                              {/* ROW 3: DAY NUMBERS & END SUBS */}
                              <tr>
                                  {/* Day Numbers */}
                                  {daysInYear.map((d, i) => (
                                      <th key={i} className={`p-1 text-center border-b-2 border-r border-slate-300 font-black text-[9px] box-border ${format(d, 'E') === 'Fri' ? 'bg-rose-50 text-rose-700' : 'bg-white text-slate-700'}`}>
                                          {format(d, 'd')}
                                      </th>
                                  ))}

                                  {/* Fixed Leaves Subheaders */}
                                  <th className="bg-rose-50 border-b-2 border-r border-slate-300 p-1 text-center font-bold text-rose-700 w-[40px] min-w-[40px] max-w-[40px] box-border" title="Sick Leave (30 Max)">SL</th>
                                  <th className="bg-orange-50 border-b-2 border-r-2 border-slate-300 p-1 text-center font-bold text-orange-700 w-[40px] min-w-[40px] max-w-[40px] box-border" title="Emergency Leave (10 Max)">EL</th>

                                  {/* CF Columns Subheaders */}
                                  <th className="bg-slate-50 border-b-2 border-r border-l-2 border-slate-300 p-1 text-center font-bold text-slate-600 w-16 box-border" title="Carried Forward OFF">OFF</th>
                                  <th className="bg-slate-50 border-b-2 border-r border-slate-300 p-1 text-center font-bold text-slate-600 w-16 box-border" title="Carried Forward VAC (AL)">VAC</th>
                                  <th className="bg-slate-50 border-b-2 border-r border-slate-300 p-1 text-center font-bold text-slate-600 w-16 box-border" title="Carried Forward PH">PH</th>
                              </tr>
                          </thead>
                          
                          <tbody className="font-medium">
                              {filteredHosts.map((host, index) => (
                                  <tr key={host.id} className="hover:bg-slate-50 transition-colors group">
                                      {/* FIXED INDEX COLUMN */}
                                      <td className="max-md:static md:sticky md:left-0 z-50 bg-white border-b border-r border-slate-200 p-2 text-center font-black text-slate-300 w-[40px] min-w-[40px] max-w-[40px] box-border">
                                          {index + 1}
                                      </td>

                                      {/* FIXED NAME COLUMN - Widened to 240px with graceful truncation */}
                                      <td className="max-md:static md:sticky md:left-[40px] z-50 bg-white group-hover:bg-slate-50 border-b border-r border-slate-200 p-2 pl-3 w-[240px] min-w-[240px] max-w-[240px] box-border">
                                          <div className="font-bold text-slate-800 text-xs truncate w-[220px]" title={host.full_name}>{host.full_name}</div>
                                          <div className="text-[9px] text-slate-400 uppercase mt-0.5 truncate w-[220px]" title={`${host.host_id} • ${host.role}`}>{host.host_id} • {host.role}</div>
                                          {host.joining_date ? (
                                              <div className="text-[8px] text-emerald-600 font-bold mt-0.5 truncate w-[220px]">
                                                  Joined: {format(parseISO(host.joining_date), 'dd MMM yyyy')}
                                              </div>
                                          ) : (
                                              <div className="text-[8px] text-slate-300 font-bold mt-0.5 truncate w-[220px]">
                                                  Joined: N/A
                                              </div>
                                          )}
                                      </td>
                                      
                                      {/* FIXED BALANCES COLUMNS */}
                                      <td className="max-md:static md:sticky md:left-[280px] z-50 bg-emerald-50 group-hover:bg-emerald-100 border-b border-r border-slate-200 p-2 text-center font-black text-emerald-700 w-[40px] min-w-[40px] max-w-[40px] box-border">{host.balOff}</td>
                                      <td className="max-md:static md:sticky md:left-[320px] z-50 bg-cyan-50 group-hover:bg-cyan-100 border-b border-r border-slate-200 p-2 text-center font-black text-cyan-700 w-[40px] min-w-[40px] max-w-[40px] box-border">{host.balAL}</td>
                                      <td className="max-md:static md:sticky md:left-[360px] z-50 bg-blue-50 group-hover:bg-blue-100 border-b border-r border-slate-200 p-2 text-center font-black text-blue-700 w-[40px] min-w-[40px] max-w-[40px] box-border">{host.balPH}</td>
                                      <td className="max-md:static md:sticky md:left-[400px] z-50 bg-fuchsia-50 group-hover:bg-fuchsia-100 border-b border-r border-slate-200 p-2 text-center font-black text-fuchsia-700 w-[40px] min-w-[40px] max-w-[40px] box-border">{host.balRR}</td>
                                      <td className="max-md:static md:sticky md:left-[440px] z-50 bg-purple-100 group-hover:bg-purple-200 border-b border-r-2 border-slate-300 p-2 text-center font-black text-purple-900 w-[50px] min-w-[50px] max-w-[50px] box-border shadow-[2px_0_5px_rgba(0,0,0,0.1)]">{host.balTotal}</td>

                                      {/* 365 ATTENDANCE CELLS */}
                                      {daysInYear.map(date => {
                                          const dateStr = format(date, 'yyyy-MM-dd');
                                          const record = attendance.find(a => a.host_id === host.host_id && a.date === dateStr);
                                          const val = record ? record.status_code : '';
                                          const isFriday = format(date, 'E') === 'Fri';

                                          return (
                                              <AttendanceCell 
                                                  key={dateStr}
                                                  initialVal={val}
                                                  hostId={host.host_id}
                                                  dateStr={dateStr}
                                                  isFriday={isFriday}
                                                  onSave={handleStatusChange}
                                              />
                                          );
                                      })}

                                      {/* FIXED LEAVES (SL & EL) NOW AT THE END */}
                                      <td className={`bg-rose-50/50 group-hover:bg-rose-50 border-b border-r border-slate-200 p-2 text-center font-black w-[40px] min-w-[40px] max-w-[40px] box-border ${host.balSL < 5 ? 'text-rose-600' : 'text-slate-700'}`}>{host.balSL}</td>
                                      <td className="bg-orange-50/50 group-hover:bg-orange-50 border-b border-r-2 border-slate-300 p-2 text-center font-black text-orange-700 w-[40px] min-w-[40px] max-w-[40px] box-border">{host.balEL}</td>

                                      {/* DB BASELINE CF INPUTS (Far Right) */}
                                      <td className="border-b border-r border-l-2 border-slate-300 p-0 relative h-8 w-16 bg-emerald-50/30">
                                          <input type="number" step="0.1" className="w-full h-full appearance-none outline-none text-center text-xs font-black bg-transparent text-emerald-700 focus:bg-emerald-100" value={host.cf_off === 0 ? '0' : host.cf_off || ''} onChange={(e) => handleCfChange(host.host_id, 'cf_off', e.target.value === '' ? '' : parseFloat(e.target.value))} />
                                      </td>
                                      <td className="border-b border-r border-slate-300 p-0 relative h-8 w-16 bg-cyan-50/30">
                                          <input type="number" step="0.1" className="w-full h-full appearance-none outline-none text-center text-xs font-black bg-transparent text-cyan-700 focus:bg-cyan-100" value={host.cf_al === 0 ? '0' : host.cf_al || ''} onChange={(e) => handleCfChange(host.host_id, 'cf_al', e.target.value === '' ? '' : parseFloat(e.target.value))} />
                                      </td>
                                      <td className="border-b border-r border-slate-300 p-0 relative h-8 w-16 bg-blue-50/30">
                                          <input type="number" step="0.1" className="w-full h-full appearance-none outline-none text-center text-xs font-black bg-transparent text-blue-700 focus:bg-blue-100" value={host.cf_ph === 0 ? '0' : host.cf_ph || ''} onChange={(e) => handleCfChange(host.host_id, 'cf_ph', e.target.value === '' ? '' : parseFloat(e.target.value))} />
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              )}
          </div>
      </div>

      {/* MAGIC PASTE MODAL */}
      {isMagicOpen && (
          <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
                  <div className="p-5 bg-emerald-600 text-white flex justify-between items-center shrink-0">
                      <div>
                          <h3 className="text-lg font-black flex items-center gap-2"><Wand2 size={20}/> Magic Roster Parse</h3>
                          <p className="text-xs text-emerald-100 font-medium mt-1">Paste WhatsApp message. AI will link names and shifts automatically.</p>
                      </div>
                      <button onClick={() => { setIsMagicOpen(false); setMagicResults(null); setMagicText(''); }} className="bg-black/10 p-2 rounded-full hover:bg-black/20"><X size={18}/></button>
                  </div>

                  <div className="flex-1 flex flex-col md:flex-row min-h-0">
                      {/* INPUT AREA */}
                      <div className="w-full md:w-1/2 p-5 border-b md:border-b-0 md:border-r border-slate-200 flex flex-col gap-3 shrink-0">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Paste Message Here</label>
                          <textarea 
                              className="flex-1 p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono outline-none focus:border-emerald-500 resize-none"
                              placeholder="e.g.&#10;Tomorrow's Duty:&#10;Off: Nimal, Ziyad&#10;Morning: Shamil, Eeku"
                              value={magicText}
                              onChange={e => setMagicText(e.target.value)}
                          />
                          <button 
                              onClick={handleMagicParse} 
                              disabled={isParsing || !magicText}
                              className="w-full py-4 bg-slate-800 text-white rounded-xl font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
                          >
                              {isParsing && !magicResults ? <Loader2 size={16} className="animate-spin"/> : <Wand2 size={16}/>}
                              Parse with AI
                          </button>
                      </div>

                      {/* RESULTS AREA */}
                      <div className="w-full md:w-1/2 p-0 flex flex-col bg-slate-50 overflow-hidden">
                          {!magicResults ? (
                              <div className="flex-1 flex flex-col items-center justify-center text-slate-300 p-8 text-center">
                                  <CalIcon size={48} strokeWidth={1} className="mb-4 opacity-50"/>
                                  <p className="font-bold text-sm">Awaiting Input</p>
                                  <p className="text-xs mt-2">Results will appear here for review before saving.</p>
                              </div>
                          ) : (
                              <div className="flex flex-col h-full">
                                  <div className="p-4 bg-white border-b border-slate-200 shrink-0">
                                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Detected Date: <span className="text-[#6D2158] ml-1">{magicResults.date}</span></p>
                                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Department: <span className="text-emerald-600 ml-1">{magicResults.department}</span></p>
                                  </div>
                                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                                      {magicResults.records.map((r: any, idx: number) => (
                                          <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200 flex justify-between items-center shadow-sm">
                                              <div>
                                                  <p className="font-bold text-slate-800 text-sm">{r.full_name}</p>
                                                  <p className="text-[10px] text-slate-400 font-mono">{r.host_id}</p>
                                              </div>
                                              <div className="text-right">
                                                  <span className={`px-2 py-1 rounded text-xs font-black ${STATUS_COLORS[r.status_code] || 'bg-slate-100 text-slate-600'}`}>{r.status_code}</span>
                                                  {r.shift_note && <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">{r.shift_note}</p>}
                                              </div>
                                          </div>
                                      ))}
                                      {magicResults.records.length === 0 && <p className="text-center text-slate-400 italic text-sm mt-10">No valid staff matched.</p>}
                                  </div>
                                  <div className="p-4 bg-white border-t border-slate-200 shrink-0">
                                      <button 
                                          onClick={handleMagicSave} 
                                          disabled={isParsing || magicResults.records.length === 0}
                                          className="w-full py-4 bg-emerald-600 text-white rounded-xl font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-lg hover:bg-emerald-700 disabled:opacity-50"
                                      >
                                          {isParsing ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>}
                                          Save to Roster
                                      </button>
                                  </div>
                              </div>
                          )}
                      </div>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
}
"use client";
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import { 
  Search, Loader2, UserCheck, 
  ChevronLeft, ChevronRight, Save, X, Calendar as CalIcon, MessageSquareText, Clock, ArrowRight, BarChart2, HeartPulse, AlertCircle, CalendarDays, Pill, AlertTriangle, ShieldCheck, FileSpreadsheet
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { differenceInDays, parseISO, isAfter, isBefore, format } from 'date-fns';
import toast from 'react-hot-toast';
import { fetchAttendanceRange, fetchROEvents, isWorkedLeave, isRO, hasWorkingNote, RO_EARNING_CODES, pendingWorkedDays, roForDay, roNoteFor, workedNoteWithRO, workedNoteWithoutRO, fmtNoteDate } from '@/lib/attendanceData';
import { computeLeaveBalancesRPC } from '@/lib/payrollMath'; 

// --- CONFIG ---
const STATUS_CODES = ['P', 'O', 'AL', 'PH', 'RR', 'SL', 'NP', 'A', 'CL', 'PA', 'MA', 'EL', 'OT', 'RO'];

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
  'RO': 'bg-yellow-300 text-yellow-900 font-black shadow-sm ring-1 ring-yellow-400', // Replacement Off
};

// Days before a host's joining date are blacked out and can't be filled in.
const isBeforeJoin = (host: any, dateStr: string) => {
    const j = host?.joining_date ? String(host.joining_date).slice(0, 10) : '';
    return !!j && dateStr < j;
};

// --- OPTIMIZED MEMOIZED CELL COMPONENT ---
type AttendanceCellProps = {
    hostId: string;
    hostName: string;
    val: string;
    note: string;
    shiftType: string;
    dateStr: string;
    isFriday: boolean;
    isPH: boolean;
    isToday: boolean;
    beforeJoin: boolean;
    rIdx: number;
    cIdx: number;
    onOpenEdit: (hostId: string, hostName: string, dateStr: string, status: string, note: string, shiftType: string, rIdx: number, cIdx: number) => void;
    onQuickSave: (hostId: string, dateStr: string, newStatus: string, rIdx: number, cIdx: number) => void;
};

const AttendanceCell = React.memo(({ hostId, hostName, val, note, shiftType, dateStr, isFriday, isPH, isToday, beforeJoin, rIdx, cIdx, onOpenEdit, onQuickSave }: AttendanceCellProps) => {
    // Leave on paper but the comment says "working day": the host worked → earns an RO.
    const worked = isWorkedLeave({ status_code: val, shift_note: note });
    const colorClass = val ? STATUS_COLORS[val] : 'text-slate-300';
    const bgBase = isToday ? 'bg-amber-50/60 border-amber-200' : isPH ? 'bg-blue-50/50' : isFriday ? 'bg-rose-50/30' : 'bg-white';
    
    const hasNote = !!note && note.trim() !== '';

    const keyBuffer = useRef('');
    const keyTimer = useRef<NodeJS.Timeout | null>(null);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTableCellElement>) => {
        e.stopPropagation();

        let nextR = rIdx;
        let nextC = cIdx;

        if (e.key === 'ArrowRight') nextC++;
        else if (e.key === 'ArrowLeft') nextC--;
        else if (e.key === 'ArrowDown') nextR++;
        else if (e.key === 'ArrowUp') nextR--;

        if (nextR !== rIdx || nextC !== cIdx) {
            e.preventDefault();
            const nextCell = document.getElementById(`cell-${nextR}-${nextC}`);
            if (nextCell) nextCell.focus();
            return;
        }

        if (beforeJoin) return; // not joined yet: nothing to enter

        if (e.key === 'Enter') {
            e.preventDefault();
            onOpenEdit(hostId, hostName, dateStr, val, note, shiftType, rIdx, cIdx);
            return;
        }

        if (e.key === 'Backspace' || e.key === 'Delete') {
            e.preventDefault();
            onQuickSave(hostId, dateStr, '', rIdx, cIdx);
            return;
        }

        const char = e.key.toUpperCase();
        if (/^[A-Z]$/.test(char)) {
            e.preventDefault();
            keyBuffer.current += char;
            if (keyTimer.current) clearTimeout(keyTimer.current);

            keyTimer.current = setTimeout(() => {
                const exactMatch = STATUS_CODES.find(c => c === keyBuffer.current);
                if (exactMatch) {
                    onQuickSave(hostId, dateStr, exactMatch, rIdx, cIdx);
                } else {
                    const fallbackMatch = STATUS_CODES.find(c => c === char);
                    if (fallbackMatch) {
                        onQuickSave(hostId, dateStr, fallbackMatch, rIdx, cIdx);
                    }
                }
                keyBuffer.current = '';
            }, 300); 
        }
    };

    if (beforeJoin) {
        return (
            <td id={`cell-${rIdx}-${cIdx}`} data-r={rIdx} data-c={cIdx} tabIndex={0} onKeyDown={handleKeyDown}
                title="Not joined yet"
                className="border-b border-r border-slate-800 p-0 h-10 w-10 min-w-[40px] max-w-[40px] bg-slate-900 box-border select-none cursor-not-allowed [&.cell-selected]:ring-2 [&.cell-selected]:ring-inset [&.cell-selected]:ring-blue-400" />
        );
    }

    return (
        <td 
            id={`cell-${rIdx}-${cIdx}`}
            data-r={rIdx}
            data-c={cIdx}
            tabIndex={0}
            onClick={(e) => {
                if (e.detail === 2) onOpenEdit(hostId, hostName, dateStr, val, note, shiftType, rIdx, cIdx);
            }}
            onKeyDown={handleKeyDown}
            className={`border-b border-r p-0 h-10 w-10 min-w-[40px] max-w-[40px] align-middle cursor-cell transition-colors box-border relative select-none [&.cell-selected]:bg-blue-100 [&.cell-selected]:ring-2 [&.cell-selected]:ring-inset [&.cell-selected]:ring-blue-600 [&.cell-selected]:z-20 ${val ? colorClass : bgBase} ${!isToday && !val ? 'border-slate-200' : ''}`}
        >
            <div className="w-full h-full flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[11px] font-bold leading-none">{val || '-'}</span>
                {shiftType && <span className="text-[7px] leading-none font-bold opacity-60 mt-1 truncate w-full text-center px-0.5">{shiftType}</span>}
            </div>
            {worked && <div className="absolute bottom-1 left-1 w-1.5 h-1.5 bg-emerald-500 rounded-full ring-1 ring-white pointer-events-none" title="Working day: earns 1 RO"></div>}
            {hasNote && <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-rose-500 rounded-full shadow-sm pointer-events-none" title={`Note: ${note}`}></div>}
        </td>
    );
});
AttendanceCell.displayName = 'AttendanceCell';


export default function AttendancePage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false); 
  
  // Date & Grid Setup
  const [cutoffDate, setCutoffDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastFocusedCell = useRef<string | null>(null);
  
  // Data
  const [hosts, setHosts] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [historicalStats, setHistoricalStats] = useState<any[]>([]); 
  const [roEvents, setRoEvents] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [publicHolidays, setPublicHolidays] = useState<{date: string, name: string}[]>([]);
  
  const [teamConfig, setTeamConfig] = useState<any>({ hostDepartments: {}, supervisorAccess: {}, nicknames: {}, excludeAttendance: {} });

  const [editCell, setEditCell] = useState<{ hostId: string, hostName: string, dateStr: string, status: string, note: string, shiftType: string, origStatus: string, origNote: string, roFor: string | null } | null>(null);
  // Totals of the selected cells (shown when more than one cell is selected)
  const [selStats, setSelStats] = useState<{ hosts: number, days: number, cells: number, counts: [string, number][], worked: number, blank: number, notJoined: number } | null>(null);

  const [isInsightsOpen, setIsInsightsOpen] = useState(false);
  const [isROModalOpen, setIsROModalOpen] = useState(false); // NEW MODAL STATE


  const [isDragging, setIsDragging] = useState(false);
  const selectionRef = useRef({ r1: -1, c1: -1, r2: -1, c2: -1 });

  const filteredHostsRef = useRef<any[]>([]);
  const daysInYearRef = useRef<string[]>([]);

  useEffect(() => { fetchData(); }, [selectedYear]);

  useEffect(() => {
      if (!isLoading && scrollRef.current) {
          requestAnimationFrame(() => {
              const todayCol = document.getElementById('today-col');
              if (todayCol && scrollRef.current) {
                  scrollRef.current.scrollLeft = Math.max(0, todayCol.offsetLeft - 530 - 32); 
              }
              requestAnimationFrame(() => setIsScrolled(true));
          });
      }
  }, [isLoading, selectedYear]);

  useEffect(() => {
      if (lastFocusedCell.current) {
          document.getElementById(lastFocusedCell.current)?.focus();
      }
  }, [attendance]);

  useEffect(() => {
      const handleGlobalMouseUp = () => setIsDragging(false);
      window.addEventListener('mouseup', handleGlobalMouseUp);
      return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  const daysInYear = useMemo(() => {
      const days: string[] = [];
      const isLeap = (selectedYear % 4 === 0 && selectedYear % 100 !== 0) || (selectedYear % 400 === 0);
      const daysInMonths = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      
      for (let m = 0; m < 12; m++) {
          for (let d = 1; d <= daysInMonths[m]; d++) {
              days.push(`${selectedYear}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
          }
      }
      return days;
  }, [selectedYear]);

  useEffect(() => { daysInYearRef.current = daysInYear; }, [daysInYear]);

  const saveToDatabase = useCallback(async (hostId: string, dateStr: string, status: string, note?: string, shift?: string) => {
      const { data: existingArr, error: fetchErr } = await supabase.from('hsk_attendance')
          .select('id, shift_note, shift_type')
          .eq('host_id', hostId)
          .eq('date', dateStr)
          .limit(1); 
          
      if (fetchErr) throw fetchErr;
      const existing = existingArr?.[0];

      if (existingArr && existingArr.length > 1) {
          const extraIds = existingArr.slice(1).map(r => r.id);
          await supabase.from('hsk_attendance').delete().in('id', extraIds);
      }

      const finalNote = note !== undefined ? note : (existing?.shift_note || null);
      const finalShift = shift !== undefined ? shift : (existing?.shift_type || null);

      if (status === '' && (!finalNote || finalNote.trim() === '') && (!finalShift || finalShift.trim() === '')) {
          if (existing && existing.id) {
              const { error } = await supabase.from('hsk_attendance').delete().eq('id', existing.id);
              if (error) throw error;
          }
      } else {
          const payload = {
              host_id: hostId,
              date: dateStr,
              status_code: status,
              shift_note: finalNote,
              shift_type: finalShift
          };

          if (existing && existing.id) {
              const { error } = await supabase.from('hsk_attendance').update(payload).eq('id', existing.id);
              if (error) throw error;
          } else {
              const { error } = await supabase.from('hsk_attendance').insert(payload);
              if (error) throw error;
          }
      }
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    setIsScrolled(false);
    
    // Everything loads at the same time (the year's attendance comes in parallel pages).
    const [constRes, hostRes, rpcRes, rawAtt, roRows] = await Promise.all([
        supabase.from('hsk_constants').select('*').in('type', ['public_holiday', 'role_rank', 'team_viewer_config']),
        supabase.from('hsk_hosts').select('*').neq('status', 'Resigned'),
        supabase.rpc('get_all_attendance_stats', { p_target_date: cutoffDate }),
        fetchAttendanceRange(`${selectedYear}-01-01`, `${selectedYear}-12-31`),
        fetchROEvents(),
    ]);
    
    let roleRanks: Record<string, number> = {};
    if (constRes.data) {
        const parsedHolidays = constRes.data
            .filter((c: any) => c.type === 'public_holiday')
            .map((c: any) => {
                const [d, n] = c.label.split('::');
                return { date: d, name: n };
            });
        setPublicHolidays(parsedHolidays);

        constRes.data.filter((c: any) => c.type === 'role_rank').forEach((c: any) => {
            const [role, rank] = c.label.split('::');
            if (role && rank) roleRanks[role.toLowerCase().trim()] = parseInt(rank, 10);
        });

        constRes.data.filter((c: any) => c.type === 'team_viewer_config').forEach((c: any) => {
            try { setTeamConfig(JSON.parse(c.label)); } catch(e) {}
        });
    }
    
    if (hostRes.data) {
        const sortedHosts = hostRes.data.sort((a, b) => {
            const rankA = roleRanks[(a.role || '').toLowerCase().trim()] ?? 999;
            const rankB = roleRanks[(b.role || '').toLowerCase().trim()] ?? 999;
            if (rankA !== rankB) return rankA - rankB;
            
            const numA = parseInt((a.host_id || '').replace(/\D/g, ''), 10) || 999999;
            const numB = parseInt((b.host_id || '').replace(/\D/g, ''), 10) || 999999;
            return numA - numB;
        });
        setHosts(sortedHosts);
    }

    setHistoricalStats(rpcRes.data || []);
    setRoEvents(roRows);
    setAttendance(rawAtt);
    
    setIsLoading(false);
  };

  const attendanceMap = useMemo(() => {
      const map = new Map<string, any>();
      attendance.forEach(a => map.set(`${a.host_id}_${a.date}`, a));
      return map;
  }, [attendance]);

  const roRows = useMemo(() => {
      const y = `${selectedYear}-`;
      return [
          ...roEvents.filter(r => !String(r.date).startsWith(y)),
          ...attendance.filter(a => isRO(a) || hasWorkingNote(a.shift_note)),
      ];
  }, [roEvents, attendance, selectedYear]);

  const hostBalances = useMemo(() => {
    if (hosts.length === 0) return hosts;

    // Group the year's rows by host once, instead of scanning all rows for every host.
    const byHost = new Map<string, any[]>();
    attendance.forEach(a => {
      const k = String(a.host_id).trim();
      const list = byHost.get(k);
      if (list) list.push(a); else byHost.set(k, [a]);
    });
    const yearData = attendance.length > 0;

    return hosts.map(host => {
      const rows = byHost.get(String(host.host_id).trim()) || [];
      // An empty list would switch the maths to yearly totals; pass a harmless marker row instead.
      const mathResult = computeLeaveBalancesRPC(host, rows.length || !yearData ? rows : [{ host_id: host.host_id, date: '', status_code: '' }], historicalStats, cutoffDate, publicHolidays, [], roRows);
      if (!mathResult) return host;
      return { ...host, ...mathResult };
    });
  }, [hosts, attendance, historicalStats, cutoffDate, publicHolidays, roRows]);

  const filteredHosts = useMemo(() => {
    return hostBalances.filter(h => {
        if (teamConfig.excludeAttendance?.[h.host_id]) return false;

        const query = searchQuery.toLowerCase();
        const configNick = (teamConfig.nicknames?.[h.host_id] || '').toLowerCase();
        
        return h.full_name.toLowerCase().includes(query) || 
               h.host_id.toLowerCase().includes(query) ||
               configNick.includes(query) ||
               (h.nicknames && h.nicknames.toLowerCase().includes(query));
    });
  }, [hostBalances, searchQuery, teamConfig]);

  useEffect(() => { filteredHostsRef.current = filteredHosts; }, [filteredHosts]);
  const attendanceMapRef = useRef<Map<string, any>>(new Map());
  useEffect(() => { attendanceMapRef.current = attendanceMap; }, [attendanceMap]);

  // =========================================================================
  // ⚡ CUSTOM RO (REPLACEMENT OFF) CALCULATOR ENGINE
  // =========================================================================
  const roLedger = useMemo(() => {
      return hostBalances
          .filter((h: any) => !teamConfig.excludeAttendance?.[h.host_id] && ((h.roEarned || 0) > 0 || (h.roTaken || 0) > 0))
          .map((h: any) => ({ host: h, earned: h.roEarned || 0, taken: h.roTaken || 0, balance: h.balRO || 0, earnedDates: h.roEarnedDates || [], takenDates: h.roTakenDates || [] }))
          .sort((a: any, b: any) => b.balance - a.balance || b.earned - a.earned);
  }, [hostBalances, teamConfig]);


  // =========================================================================
  // 📊 DATA INSIGHTS ENGINE
  // =========================================================================
  const insightsData = useMemo(() => {
      let totalLiability = 0, totalAL = 0, totalOff = 0, totalPH = 0;
      let totalLeavesTaken = 0; 
      let totalRO_Owed = 0; 

      const monthlyStats = Array.from({length: 12}, () => ({
          off: 0, al: 0, ph: 0, sl: 0,
          sickStaff: {} as Record<string, number>,
          topSickPerson: null as {name: string, count: number} | null
      }));

      hostBalances.forEach(h => {
          totalLiability += parseFloat(h.balTotal) || 0;
          totalAL += parseFloat(h.balAL) || 0;
          totalOff += parseFloat(h.balOff) || 0;
          totalPH += parseFloat(h.balPH) || 0;
      });

      // Add the total RO balance to the liability
      roLedger.forEach(l => {
          if (l.balance > 0) totalRO_Owed += l.balance;
      });

      attendance.forEach(a => {
          if (!a.date) return;
          const d = parseISO(a.date);
          const m = d.getMonth();

          if (isWorkedLeave(a)) return; // worked that day ("working day" comment)
          if (['O', 'OFF', 'OT', 'RO'].includes(a.status_code)) {
              monthlyStats[m].off++;
              totalLeavesTaken++;
          }
          if (['AL', 'VAC'].includes(a.status_code)) {
              monthlyStats[m].al++;
              totalLeavesTaken++;
          }
          if (a.status_code === 'PH') {
              monthlyStats[m].ph++;
              totalLeavesTaken++;
          }

          if (a.status_code === 'SL') {
              monthlyStats[m].sl++;
              const host = hosts.find(h => h.host_id === a.host_id);
              if (host) {
                  monthlyStats[m].sickStaff[host.full_name] = (monthlyStats[m].sickStaff[host.full_name] || 0) + 1;
              }
          }
      });

      monthlyStats.forEach(stat => {
          const sorted = Object.entries(stat.sickStaff).sort((a, b) => b[1] - a[1]);
          if (sorted.length > 0) stat.topSickPerson = { name: sorted[0][0], count: sorted[0][1] };
      });

      const topOwed = [...hostBalances]
          .sort((a, b) => (parseFloat(b.balTotal) || 0) - (parseFloat(a.balTotal) || 0))
          .slice(0, 5);

      return { totalLiability, totalAL, totalOff, totalPH, totalLeavesTaken, totalRO_Owed, monthlyStats, topOwed };
  }, [hostBalances, attendance, hosts, roLedger]);


  // --- EXCEL ENGINE FUNCTIONS (Memoized for Performance) ---
  const updateSelectionVisuals = useCallback(() => {
      document.querySelectorAll('.cell-selected').forEach(el => el.classList.remove('cell-selected'));
      const { r1, c1, r2, c2 } = selectionRef.current;
      if (r1 === -1) return;

      const minR = Math.min(r1, r2); const maxR = Math.max(r1, r2);
      const minC = Math.min(c1, c2); const maxC = Math.max(c1, c2);

      for(let r=minR; r<=maxR; r++) {
          for(let c=minC; c<=maxC; c++) {
              document.getElementById(`cell-${r}-${c}`)?.classList.add('cell-selected');
          }
      }
      
      document.getElementById(`cell-${r2}-${c2}`)?.focus({ preventScroll: true });

      // Totals for the selected block
      if (minR === maxR && minC === maxC) { setSelStats(null); return; }
      const fHosts = filteredHostsRef.current;
      const dYear = daysInYearRef.current;
      const map = attendanceMapRef.current;
      const counts: Record<string, number> = {};
      let worked = 0, blank = 0, notJoined = 0, cells = 0;
      for (let r = minR; r <= maxR; r++) {
          const host = fHosts[r];
          if (!host) continue;
          const joined = host.joining_date ? String(host.joining_date).slice(0, 10) : '';
          for (let c = minC; c <= maxC; c++) {
              const d = dYear[c];
              if (!d) continue;
              cells++;
              if (joined && d < joined) { notJoined++; continue; }
              const rec = map.get(`${host.host_id}_${d}`);
              const code = String(rec?.status_code || '').trim().toUpperCase();
              if (!code) { blank++; continue; }
              if (isWorkedLeave(rec)) { worked++; continue; }
              counts[code] = (counts[code] || 0) + 1;
          }
      }
      const order = (k: string) => { const i = STATUS_CODES.indexOf(k); return i < 0 ? 99 : i; };
      setSelStats({
          hosts: maxR - minR + 1, days: maxC - minC + 1, cells,
          counts: Object.entries(counts).sort((a, b) => order(a[0]) - order(b[0])),
          worked, blank, notJoined,
      });
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
      const td = (e.target as HTMLElement).closest('td[data-r]');
      if (!td) return;
      const r = parseInt(td.getAttribute('data-r')!);
      const c = parseInt(td.getAttribute('data-c')!);
      
      if (e.shiftKey && selectionRef.current.r1 !== -1) {
          selectionRef.current.r2 = r;
          selectionRef.current.c2 = c;
      } else {
          selectionRef.current = { r1: r, c1: c, r2: r, c2: c };
      }
      
      setIsDragging(true);
      updateSelectionVisuals();
  };

  const handleMouseOver = (e: React.MouseEvent) => {
      if (!isDragging) return;
      const td = (e.target as HTMLElement).closest('td[data-r]');
      if (!td) return;
      const r = parseInt(td.getAttribute('data-r')!);
      const c = parseInt(td.getAttribute('data-c')!);
      selectionRef.current.r2 = r;
      selectionRef.current.c2 = c;
      updateSelectionVisuals();
  };

  const applyBulkStatus = useCallback(async (status: string) => {
      const { r1, c1, r2, c2 } = selectionRef.current;
      if (r1 === -1) return;

      lastFocusedCell.current = `cell-${r2}-${c2}`;

      const minR = Math.min(r1, r2); const maxR = Math.max(r1, r2);
      const minC = Math.min(c1, c2); const maxC = Math.max(c1, c2);
      
      const fHosts = filteredHostsRef.current;
      const dYear = daysInYearRef.current;

      setAttendance(prev => {
          const newAtt = [...prev];
          for (let r = minR; r <= maxR; r++) {
              for (let c = minC; c <= maxC; c++) {
                  const hostId = fHosts[r]?.host_id;
                  if (!hostId) continue;
                  const dateStr = dYear[c];
                  if (isBeforeJoin(fHosts[r], dateStr)) continue;
                  const existingIdx = newAtt.findIndex(a => a.host_id === hostId && a.date === dateStr);
                  
                  if (status === '') {
                      if (existingIdx > -1) {
                          const existing = newAtt[existingIdx];
                          if (!existing.shift_note && !existing.shift_type) {
                              newAtt.splice(existingIdx, 1);
                          } else {
                              newAtt[existingIdx] = { ...existing, status_code: '' };
                          }
                      }
                  } else {
                      if (existingIdx > -1) {
                          newAtt[existingIdx] = { ...newAtt[existingIdx], status_code: status };
                      } else {
                          newAtt.push({ host_id: hostId, date: dateStr, status_code: status, shift_note: '', shift_type: '' });
                      }
                  }
              }
          }
          return newAtt;
      });

      const dbTask = async () => {
          for (let r = minR; r <= maxR; r++) {
              for (let c = minC; c <= maxC; c++) {
                  const hostId = fHosts[r]?.host_id;
                  if (!hostId) continue;
                  const dateStr = dYear[c];
                  if (isBeforeJoin(fHosts[r], dateStr)) continue;
                  await saveToDatabase(hostId, dateStr, status);
              }
          }
      };

      const cellCount = (maxR - minR + 1) * (maxC - minC + 1);
      toast.promise(dbTask(), {
          loading: `Saving ${cellCount} cells...`,
          success: status === '' ? 'Cleared' : 'Saved',
          error: 'Save failed'
      });
  }, [saveToDatabase]);

  const quickSaveCell = useCallback(async (hostId: string, dateStr: string, status: string, rIdx: number, cIdx: number) => {
      lastFocusedCell.current = `cell-${rIdx}-${cIdx}`; 
      
      setAttendance(prev => {
          const newAtt = [...prev];
          const existingIdx = newAtt.findIndex(a => a.host_id === hostId && a.date === dateStr);
          
          if (status === '') {
              if (existingIdx > -1) {
                  const existing = newAtt[existingIdx];
                  if (!existing.shift_note && !existing.shift_type) {
                      newAtt.splice(existingIdx, 1);
                  } else {
                      newAtt[existingIdx] = { ...existing, status_code: '' };
                  }
              }
          } else {
              if (existingIdx > -1) {
                  newAtt[existingIdx] = { ...newAtt[existingIdx], status_code: status };
              } else {
                  newAtt.push({ host_id: hostId, date: dateStr, status_code: status, shift_note: '', shift_type: '' });
              }
          }
          return newAtt;
      });

      toast.promise(saveToDatabase(hostId, dateStr, status), {
          loading: 'Saving...',
          success: status === '' ? 'Cleared' : 'Saved',
          error: 'Save failed'
      });
  }, [saveToDatabase]);

  const handleOpenEdit = useCallback((hostId: string, hostName: string, dateStr: string, status: string, note: string, shiftType: string, rIdx: number, cIdx: number) => {
      selectionRef.current = { r1: rIdx, c1: cIdx, r2: rIdx, c2: cIdx };
      updateSelectionVisuals();
      setEditCell({ hostId, hostName, dateStr, status, note, shiftType, origStatus: status, origNote: note, roFor: status === 'RO' ? roForDay(note) : null });
  }, [updateSelectionVisuals]);

  const handleQuickSave = useCallback((hostId: string, dateStr: string, newStatus: string, rIdx: number, cIdx: number) => {
      const { r1, c1, r2, c2 } = selectionRef.current;
      const isMultiSelect = r1 !== -1 && (r1 !== r2 || c1 !== c2);
      
      if (isMultiSelect) {
          applyBulkStatus(newStatus);
      } else {
          quickSaveCell(hostId, dateStr, newStatus, rIdx, cIdx);
      }
  }, [applyBulkStatus, quickSaveCell]);

  const handleGlobalKeyDown = (e: React.KeyboardEvent) => {
      const { r1, c1, r2, c2 } = selectionRef.current;
      if (r1 === -1) return;

      if (e.key.startsWith('Arrow')) {
          e.preventDefault();
          let nextR = r2; let nextC = c2;
          
          if (e.key === 'ArrowRight') nextC = Math.min(nextC + 1, daysInYear.length - 1);
          if (e.key === 'ArrowLeft') nextC = Math.max(nextC - 1, 0);
          if (e.key === 'ArrowDown') nextR = Math.min(nextR + 1, filteredHosts.length - 1);
          if (e.key === 'ArrowUp') nextR = Math.max(nextR - 1, 0);

          if (e.shiftKey) {
              selectionRef.current.r2 = nextR;
              selectionRef.current.c2 = nextC;
          } else {
              selectionRef.current = { r1: nextR, c1: nextC, r2: nextR, c2: nextC };
          }
          updateSelectionVisuals();
          
          const nextCell = document.getElementById(`cell-${nextR}-${nextC}`);
          if (nextCell && scrollRef.current) {
              const container = scrollRef.current;
              const cellRect = nextCell.getBoundingClientRect();
              const contRect = container.getBoundingClientRect();
              
              if (cellRect.right > contRect.right) container.scrollBy({ left: cellRect.right - contRect.right + 50, behavior: 'smooth' });
              if (cellRect.left < contRect.left + 490) container.scrollBy({ left: cellRect.left - contRect.left - 490 - 50, behavior: 'smooth' });
              if (cellRect.bottom > contRect.bottom) container.scrollBy({ top: cellRect.bottom - contRect.bottom + 50, behavior: 'smooth' });
              if (cellRect.top < contRect.top + 100) container.scrollBy({ top: cellRect.top - contRect.top - 100, behavior: 'smooth' });
          }
          return;
      }

      if (e.key === 'Enter') {
          e.preventDefault();
          const host = filteredHosts[r1];
          const dateStr = daysInYear[c1];
          if (isBeforeJoin(host, dateStr)) return;
          const record = attendanceMap.get(`${host.host_id}_${dateStr}`);
          const st = record?.status_code || ''; const nt = record?.shift_note || '';
          setEditCell({ hostId: host.host_id, hostName: host.full_name, dateStr, status: st, note: nt, shiftType: record?.shift_type || '', origStatus: st, origNote: nt, roFor: st === 'RO' ? roForDay(nt) : null });
          return;
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
          e.preventDefault();
          applyBulkStatus('');
          return;
      }
  };

  const handleCopy = (e: React.ClipboardEvent) => {
      const { r1, c1, r2, c2 } = selectionRef.current;
      if (r1 === -1) return;
      e.preventDefault();

      const minR = Math.min(r1, r2); const maxR = Math.max(r1, r2);
      const minC = Math.min(c1, c2); const maxC = Math.max(c1, c2);
      
      let tsv = '';
      for(let r = minR; r <= maxR; r++) {
          let row = [];
          for(let c = minC; c <= maxC; c++) {
              const hostId = filteredHosts[r].host_id;
              const dateStr = daysInYear[c];
              const val = attendanceMap.get(`${hostId}_${dateStr}`)?.status_code || '';
              row.push(val);
          }
          tsv += row.join('\t') + '\n';
      }
      e.clipboardData.setData('text/plain', tsv);
      toast.success('Copied to clipboard');
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
      const { r1, c1 } = selectionRef.current;
      if (r1 === -1) return;
      e.preventDefault();

      const pasteData = e.clipboardData.getData('text');
      const rows = pasteData.split('\n').map(r => r.split('\t'));
      
      let updateCount = 0;
      const tasks: { hostId: string, dateStr: string, val: string }[] = [];

      setAttendance(prev => {
          const newAtt = [...prev];
          for(let i=0; i<rows.length; i++) {
              if (r1 + i >= filteredHosts.length || !rows[i][0]) continue;
              const hostId = filteredHosts[r1 + i].host_id;
              
              for(let j=0; j<rows[i].length; j++) {
                  if (c1 + j >= daysInYear.length) continue;
                  const dateStr = daysInYear[c1 + j];
                  if (isBeforeJoin(filteredHosts[r1 + i], dateStr)) continue;
                  let val = rows[i][j].trim().toUpperCase();
                  if (val === 'V') val = 'AL'; 
                  
                  if (STATUS_CODES.includes(val) || val === '') {
                      updateCount++;
                      tasks.push({ hostId, dateStr, val });
                      const existingIdx = newAtt.findIndex(a => a.host_id === hostId && a.date === dateStr);
                      
                      if (val === '') {
                          if (existingIdx > -1) newAtt.splice(existingIdx, 1);
                      } else {
                          if (existingIdx > -1) {
                              newAtt[existingIdx] = { ...newAtt[existingIdx], status_code: val };
                          } else {
                              newAtt.push({ host_id: hostId, date: dateStr, status_code: val });
                          }
                      }
                  }
              }
          }
          return newAtt;
      });

      if (updateCount > 0) {
          const dbTask = async () => {
              for (const t of tasks) {
                  await saveToDatabase(t.hostId, t.dateStr, t.val);
              }
          };

          toast.promise(dbTask(), {
              loading: `Pasting ${updateCount} cells...`,
              success: 'Paste saved',
              error: 'Paste failed to save'
          }).then(() => {
              selectionRef.current.r2 = r1 + rows.length - 1;
              selectionRef.current.c2 = c1 + rows[0].length - 1;
              updateSelectionVisuals();
          });
      }
  };

  const handleCutoffChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newDateStr = e.target.value;
      if (!newDateStr) return;
      setCutoffDate(newDateStr);
      setSelectedYear(parseInt(newDateStr.split('-')[0], 10));
  };

  const handleYearChange = (delta: number) => {
      const newYear = selectedYear + delta;
      setSelectedYear(newYear);
      const thisYear = new Date().getFullYear();
      if (newYear === thisYear) {
          setCutoffDate(format(new Date(), 'yyyy-MM-dd'));
      } else {
          setCutoffDate(`${newYear}-12-31`);
      }
  };

  // Update one row in local state (this year) or in the RO rows (other years).
  const patchLocal = (hostId: string, dateStr: string, status: string, note: string, shiftType?: string) => {
      const apply = (list: any[]) => {
          const out = [...list];
          const idx = out.findIndex(a => a.host_id === hostId && a.date === dateStr);
          const empty = status === '' && !note?.trim() && !(shiftType ?? (idx > -1 ? out[idx].shift_type : ''))?.trim();
          if (empty) { if (idx > -1) out.splice(idx, 1); }
          else if (idx > -1) out[idx] = { ...out[idx], status_code: status, shift_note: note, ...(shiftType !== undefined ? { shift_type: shiftType } : {}) };
          else out.push({ host_id: hostId, date: dateStr, status_code: status, shift_note: note, shift_type: shiftType || '' });
          return out;
      };
      if (dateStr.startsWith(`${selectedYear}-`)) setAttendance(apply);
      else setRoEvents(apply);
  };

  const handleSaveCell = async () => {
    if (!editCell) return;
    const { hostId, dateStr, status, shiftType, origStatus, origNote, roFor } = editCell;
    let { note } = editCell;

    if (status === 'RO' && !roFor && pendingWorkedDays(roRows, hostId, origStatus === 'RO' ? dateStr : undefined).length > 0) {
        toast.error('Choose which working day this RO is for');
        return;
    }
    if (status === 'RO' && roFor) note = roNoteFor(roFor);

    // Worked days whose comment must change
    const prevLink = origStatus === 'RO' ? roForDay(origNote) : null;
    const newLink = status === 'RO' ? roFor : null;
    const findRow = (d: string) => roRows.find(r => String(r.host_id).trim() === String(hostId).trim() && String(r.date).slice(0, 10) === d);
    const linkUpdates: { date: string, status: string, note: string }[] = [];
    if (prevLink && prevLink !== newLink) {
        const w = findRow(prevLink);
        if (w) linkUpdates.push({ date: prevLink, status: w.status_code, note: workedNoteWithoutRO(w.shift_note) });
    }
    if (newLink && newLink !== prevLink) {
        const w = findRow(newLink);
        if (w) linkUpdates.push({ date: newLink, status: w.status_code, note: workedNoteWithRO(w.shift_note, dateStr) });
    }

    patchLocal(hostId, dateStr, status, note, shiftType);
    linkUpdates.forEach(u => patchLocal(hostId, u.date, u.status, u.note));

    const task = async () => {
        await saveToDatabase(hostId, dateStr, status, note, shiftType);
        for (const u of linkUpdates) await saveToDatabase(hostId, u.date, u.status, u.note);
    };
    toast.promise(task(), {
        loading: 'Saving entry...',
        success: newLink ? `RO linked to ${fmtNoteDate(newLink)}` : 'Entry saved',
        error: 'Failed to save entry'
    }).then(() => {
        setEditCell(null); 
        if (selectionRef.current.r1 !== -1) {
            document.getElementById(`cell-${selectionRef.current.r1}-${selectionRef.current.c1}`)?.focus();
        }
    });
  };

  const handleCfChange = async (hostId: string, field: string, val: number | '') => {
    const numericVal = val === '' ? 0 : val;
    setHosts(prev => prev.map(h => h.host_id === hostId ? { ...h, [field]: numericVal } : h));
    const { error } = await supabase.from('hsk_hosts').update({ [field]: numericVal }).eq('host_id', hostId);
    if (error) toast.error(`Error saving carried forward balance: ${error.message}`);
    else toast.success('CF Balance Updated');
  };


  const memoizedTableBody = useMemo(() => {
      return filteredHosts.map((host, hostIdx) => {
          const configNick = teamConfig.nicknames?.[host.host_id];
          const displayName = configNick ? `${host.full_name} (${configNick})` : host.full_name;
          const joinedOn = host.joining_date ? String(host.joining_date).slice(0, 10) : '';

          return (
          <tr key={host.id} className="hover:bg-slate-50/50 transition-colors group">
              <td className="max-md:static md:sticky md:left-0 z-50 bg-white border-b border-r border-slate-200 p-2 text-center font-black text-slate-300 w-[40px] min-w-[40px] max-w-[40px] box-border">
                  {hostIdx + 1}
              </td>

              <td className="max-md:static md:sticky md:left-[40px] z-50 bg-white group-hover:bg-slate-50 border-b border-r border-slate-200 p-2 pl-3 w-[240px] min-w-[240px] max-w-[240px] box-border">
                  <div className="font-bold text-slate-800 text-xs truncate w-[220px]" title={displayName}>{displayName}</div>
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
              
              <td className="max-md:static md:sticky md:left-[280px] z-50 bg-emerald-50 group-hover:bg-emerald-100 border-b border-r border-slate-200 p-2 text-center font-black text-emerald-700 w-[40px] min-w-[40px] max-w-[40px] box-border">{host.balOff}</td>
              <td className="max-md:static md:sticky md:left-[320px] z-50 bg-cyan-50 group-hover:bg-cyan-100 border-b border-r border-slate-200 p-2 text-center font-black text-cyan-700 w-[40px] min-w-[40px] max-w-[40px] box-border">{host.balAL}</td>
              <td className="max-md:static md:sticky md:left-[360px] z-50 bg-blue-50 group-hover:bg-blue-100 border-b border-r border-slate-200 p-2 text-center font-black text-blue-700 w-[40px] min-w-[40px] max-w-[40px] box-border">{host.balPH}</td>
              <td className="max-md:static md:sticky md:left-[400px] z-50 bg-fuchsia-50 group-hover:bg-fuchsia-100 border-b border-r border-slate-200 p-2 text-center font-black text-fuchsia-700 w-[40px] min-w-[40px] max-w-[40px] box-border">{host.balRR}</td>
              <td className="max-md:static md:sticky md:left-[440px] z-50 bg-purple-100 group-hover:bg-purple-200 border-b border-r-2 border-slate-300 p-2 text-center font-black text-purple-900 w-[50px] min-w-[50px] max-w-[50px] box-border shadow-[2px_0_5px_rgba(0,0,0,0.1)]">{host.balTotal}</td>

              {daysInYear.map((dateStr, dateIdx) => {
                  const record = attendanceMap.get(`${host.host_id}_${dateStr}`);
                  const val = record ? record.status_code : '';
                  const note = record ? record.shift_note : '';
                  const shift = record ? record.shift_type : '';
                  const d = parseISO(dateStr);
                  const isFriday = format(d, 'E') === 'Fri';
                  const isPH = publicHolidays.some(ph => ph.date === dateStr);
                  const isToday = dateStr === todayStr;

                  return (
                      <AttendanceCell 
                          key={dateStr}
                          hostId={host.host_id}
                          hostName={host.full_name}
                          val={val}
                          note={note || ''}
                          shiftType={shift || ''}
                          dateStr={dateStr}
                          isFriday={isFriday}
                          isPH={isPH}
                          isToday={isToday}
                          beforeJoin={!!joinedOn && dateStr < joinedOn}
                          rIdx={hostIdx}
                          cIdx={dateIdx}
                          onOpenEdit={handleOpenEdit}
                          onQuickSave={handleQuickSave}
                      />
                  );
              })}

              <td className={`bg-rose-50/50 group-hover:bg-rose-50 border-b border-r border-slate-200 p-2 text-center font-black w-[40px] min-w-[40px] max-w-[40px] box-border ${host.balSL < 5 ? 'text-rose-600' : 'text-slate-700'}`}>{host.balSL}</td>
              <td className="bg-orange-50/50 group-hover:bg-orange-50 border-b border-r-2 border-slate-300 p-2 text-center font-black text-orange-700 w-[40px] min-w-[40px] max-w-[40px] box-border">{host.balEL}</td>

              <td className="border-b border-r border-l-2 border-slate-300 p-0 relative h-8 w-16 bg-emerald-50/30">
                  {selectedYear > 2026 ? (
                      <div className="w-full h-full flex items-center justify-center text-xs font-black text-emerald-700 bg-emerald-100/50" title="Calculated from previous year">
                          {host.calcCfOff}
                      </div>
                  ) : (
                      <input type="number" step="0.1" className="w-full h-full appearance-none outline-none text-center text-xs font-black bg-transparent text-emerald-700 focus:bg-emerald-100" value={host.cf_off === 0 ? '0' : host.cf_off || ''} onChange={(e) => handleCfChange(host.host_id, 'cf_off', e.target.value === '' ? '' : parseFloat(e.target.value))} />
                  )}
              </td>
              <td className="border-b border-r border-slate-300 p-0 relative h-8 w-16 bg-cyan-50/30">
                  {selectedYear > 2026 ? (
                      <div className="w-full h-full flex items-center justify-center text-xs font-black text-cyan-700 bg-cyan-100/50" title="Calculated from previous year">
                          {host.calcCfAL}
                      </div>
                  ) : (
                      <input type="number" step="0.1" className="w-full h-full appearance-none outline-none text-center text-xs font-black bg-transparent text-cyan-700 focus:bg-cyan-100" value={host.cf_al === 0 ? '0' : host.cf_al || ''} onChange={(e) => handleCfChange(host.host_id, 'cf_al', e.target.value === '' ? '' : parseFloat(e.target.value))} />
                  )}
              </td>
              <td className="border-b border-r border-slate-300 p-0 relative h-8 w-16 bg-blue-50/30">
                  {selectedYear > 2026 ? (
                      <div className="w-full h-full flex items-center justify-center text-xs font-black text-blue-700 bg-blue-100/50" title="Calculated from previous year">
                          {host.calcCfPH}
                      </div>
                  ) : (
                      <input type="number" step="0.1" className="w-full h-full appearance-none outline-none text-center text-xs font-black bg-transparent text-blue-700 focus:bg-blue-100" value={host.cf_ph === 0 ? '0' : host.cf_ph || ''} onChange={(e) => handleCfChange(host.host_id, 'cf_ph', e.target.value === '' ? '' : parseFloat(e.target.value))} />
                  )}
              </td>
          </tr>
      )});
  }, [filteredHosts, daysInYear, attendanceMap, publicHolidays, handleOpenEdit, handleQuickSave, selectedYear, teamConfig]);

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
            <div className="flex flex-col items-start sm:items-end">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 ml-1">Balances As Of</span>
                <div className="relative cursor-pointer group w-fit">
                    <input 
                        type="date" 
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                        value={cutoffDate}
                        onChange={handleCutoffChange}
                    />
                    <div className="flex items-center bg-purple-50 px-4 py-2.5 rounded-xl border border-purple-200 shadow-inner group-hover:bg-purple-100 transition-colors gap-2 pointer-events-none">
                        <CalIcon size={14} className="text-[#6D2158] shrink-0 group-focus-within:animate-pulse"/>
                        <span className="font-black text-sm text-[#6D2158]">{format(parseISO(cutoffDate), 'dd MMM yyyy')}</span>
                    </div>
                </div>
            </div>

            <div className="flex flex-col items-start sm:items-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 ml-1">Grid Year</span>
                <div className="flex items-center bg-slate-50 p-1.5 rounded-xl border border-slate-200 shadow-inner">
                    <button onClick={() => handleYearChange(-1)} className="p-1 hover:bg-white rounded-lg text-slate-500"><ChevronLeft size={16}/></button>
                    <div className="w-16 text-center font-black text-sm text-[#6D2158] tracking-widest">{selectedYear}</div>
                    <button onClick={() => handleYearChange(1)} className="p-1 hover:bg-white rounded-lg text-slate-500"><ChevronRight size={16}/></button>
                </div>
            </div>

            <div className="relative flex-1 sm:w-48 mt-5">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={14}/>
                <input type="text" placeholder="Search Host or Nickname..." className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl font-bold text-xs bg-slate-50 focus:bg-white focus:border-[#6D2158] outline-none transition-all shadow-inner" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>

            {/* NEW TOP RO BUTTON */}
            <button onClick={() => setIsROModalOpen(true)} className="bg-yellow-400 text-yellow-900 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-md hover:bg-yellow-500 transition-all mt-5">
                <AlertTriangle size={14}/> RO balance
            </button>

            {/* NEW MONTHLY SHEET BUTTON */}
            <Link href="/attendance/monthly" className="bg-purple-100 text-purple-800 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-md hover:bg-purple-200 transition-all mt-5 border border-purple-200">
                <FileSpreadsheet size={14}/> Monthly Sheet
            </Link>

            <button onClick={() => setIsInsightsOpen(true)} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-md hover:bg-blue-700 transition-all mt-5">
                <BarChart2 size={14}/> Analytics
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
                  <div 
                      ref={scrollRef}
                      className={`overflow-auto flex-1 custom-scrollbar w-full relative outline-none transition-opacity duration-500 ${isScrolled ? 'opacity-100' : 'opacity-0'}`}
                      tabIndex={0} 
                      onKeyDown={handleGlobalKeyDown}
                      onCopy={handleCopy}
                      onPaste={handlePaste}
                  >
                      <table className="w-max border-separate border-spacing-0 text-[10px] whitespace-nowrap bg-white table-fixed select-none">
                          <thead className="sticky top-0 z-[70] bg-white shadow-sm">
                              <tr>
                                  <th rowSpan={2} className="max-md:static md:sticky md:left-0 z-[80] bg-slate-100 border-b-2 border-r border-slate-300 p-2 text-center w-[40px] min-w-[40px] max-w-[40px] box-border text-slate-400">#</th>
                                  <th rowSpan={2} className="max-md:static md:sticky md:left-[40px] z-[80] bg-slate-100 border-b-2 border-r border-slate-300 p-3 text-left w-[240px] min-w-[240px] max-w-[240px] box-border">
                                      <span className="block font-black uppercase text-slate-500 tracking-widest">Host Name</span>
                                      <span className="block text-[8px] font-bold text-slate-400 mt-1">ID, Role & Joined Date</span>
                                  </th>
                                  <th colSpan={5} className="max-md:static md:sticky md:left-[280px] z-[80] bg-slate-50 border-b border-r-2 border-slate-300 p-2 text-center font-black uppercase text-[#6D2158] tracking-widest shadow-[2px_0_5px_rgba(0,0,0,0.1)] w-[210px] min-w-[210px] max-w-[210px] box-border">
                                      Live Owed Balances
                                  </th>
                                  
                                  {daysInYear.map((dateStr, i) => {
                                      const d = parseISO(dateStr);
                                      const isToday = dateStr === todayStr;
                                      const isPH = publicHolidays.some(ph => ph.date === dateStr);
                                      const phName = isPH ? publicHolidays.find(ph => ph.date === dateStr)?.name : undefined;

                                      return (
                                          <th 
                                              key={i} 
                                              id={isToday ? 'today-col' : undefined}
                                              title={phName} 
                                              rowSpan={2} 
                                              className={`p-1 text-center border-b-2 border-r border-slate-300 box-border w-10 min-w-[40px] max-w-[40px] ${isToday ? 'bg-amber-300 text-amber-950 border-amber-400 shadow-inner ring-1 ring-amber-400 z-10' : isPH ? 'bg-blue-100 text-blue-800' : format(d, 'E') === 'Fri' ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-600'}`}
                                          >
                                              <div className="flex flex-col items-center justify-center leading-tight">
                                                  <span className={`text-[8px] uppercase tracking-widest ${isToday ? 'text-amber-700 font-black' : 'text-slate-400 font-bold'}`}>{format(d, 'MMM')}</span>
                                                  <span className={`text-[9px] uppercase mt-0.5 ${isToday ? 'font-black' : 'font-bold'}`}>{format(d, 'eee')}</span>
                                                  <span className={`text-xs font-black ${isToday ? 'text-amber-950 text-sm' : ''}`}>{format(d, 'dd')}</span>
                                              </div>
                                          </th>
                                      )
                                  })}

                                  <th colSpan={2} className="bg-slate-100 border-b border-r-2 border-slate-300 p-2 text-center font-black uppercase text-slate-500 tracking-widest box-border">
                                      Fixed Leaves
                                  </th>

                                  <th colSpan={3} className="bg-slate-100 border-b border-l-2 border-slate-300 p-2 text-center font-black uppercase text-slate-500 tracking-widest box-border">
                                      DB Baseline CF
                                  </th>
                              </tr>

                              <tr>
                                  <th className="max-md:static md:sticky md:left-[280px] z-[80] bg-emerald-50 border-b-2 border-r border-slate-300 p-1 text-center font-bold text-emerald-700 w-[40px] min-w-[40px] max-w-[40px] box-border" title="Off Days">OFF</th>
                                  <th className="max-md:static md:sticky md:left-[320px] z-[80] bg-cyan-50 border-b-2 border-r border-slate-300 p-1 text-center font-bold text-cyan-700 w-[40px] min-w-[40px] max-w-[40px] box-border" title="Annual Leave">AL</th>
                                  <th className="max-md:static md:sticky md:left-[360px] z-[80] bg-blue-50 border-b-2 border-r border-slate-300 p-1 text-center font-bold text-blue-700 w-[40px] min-w-[40px] max-w-[40px] box-border" title="Public Holiday">PH</th>
                                  <th className="max-md:static md:sticky md:left-[400px] z-[80] bg-fuchsia-50 border-b-2 border-r border-slate-300 p-1 text-center font-bold text-fuchsia-700 w-[40px] min-w-[40px] max-w-[40px] box-border" title="Rest & Recreation (DA/DB Only)">RR</th>
                                  <th className="max-md:static md:sticky md:left-[440px] z-[80] bg-purple-100 border-b-2 border-r-2 border-slate-300 p-1 text-center font-black text-purple-900 w-[50px] min-w-[50px] max-w-[50px] box-border shadow-[2px_0_5px_rgba(0,0,0,0.1)]" title="Total Balance">TOT</th>
                                  
                                  <th className="bg-rose-50 border-b-2 border-r border-slate-300 p-1 text-center font-bold text-rose-700 w-[40px] min-w-[40px] max-w-[40px] box-border" title="Sick Leave (30 Max)">SL</th>
                                  <th className="bg-orange-50 border-b-2 border-r-2 border-slate-300 p-1 text-center font-bold text-orange-700 w-[40px] min-w-[40px] max-w-[40px] box-border" title="Emergency Leave (10 Max)">EL</th>

                                  <th className="bg-slate-50 border-b-2 border-r border-l-2 border-slate-300 p-1 text-center font-bold text-slate-600 w-16 box-border" title="Carried Forward OFF">OFF</th>
                                  <th className="bg-slate-50 border-b-2 border-r border-slate-300 p-1 text-center font-bold text-slate-600 w-16 box-border" title="Carried Forward VAC (AL)">VAC</th>
                                  <th className="bg-slate-50 border-b-2 border-r border-slate-300 p-1 text-center font-bold text-slate-600 w-16 box-border" title="Carried Forward PH">PH</th>
                              </tr>
                          </thead>
                          
                          <tbody onMouseDown={handleMouseDown} onMouseOver={handleMouseOver} className="font-medium">
                              {memoizedTableBody}
                          </tbody>
                      </table>
                  </div>
              )}
          </div>
      </div>

      {/* SELECTION TOTALS */}
      {selStats && !editCell && (
          <div className="fixed z-[150] bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-5 left-1/2 -translate-x-1/2 md:ml-32 max-w-[calc(100vw-2rem)] bg-slate-900 text-white rounded-2xl shadow-2xl px-4 py-2.5 flex items-center gap-3 overflow-x-auto animate-in fade-in slide-in-from-bottom-2">
              <div className="shrink-0 text-xs font-black whitespace-nowrap">
                  {selStats.hosts > 1 ? `${selStats.hosts} hosts × ${selStats.days} days = ${selStats.cells}` : `${selStats.days} days`}
              </div>
              <div className="w-px h-5 bg-white/20 shrink-0" />
              <div className="flex items-center gap-1.5">
                  {selStats.counts.map(([code, n]) => (
                      <span key={code} className={`shrink-0 px-2 py-0.5 rounded-md text-[11px] font-black whitespace-nowrap ${STATUS_COLORS[code] || 'bg-white/10'}`}>{code} {n}</span>
                  ))}
                  {selStats.worked > 0 && <span className="shrink-0 px-2 py-0.5 rounded-md text-[11px] font-black bg-emerald-500 text-white whitespace-nowrap" title="Leave code with a working day comment">Worked {selStats.worked}</span>}
                  {selStats.blank > 0 && <span className="shrink-0 px-2 py-0.5 rounded-md text-[11px] font-bold bg-white/10 text-white/70 whitespace-nowrap">Blank {selStats.blank}</span>}
                  {selStats.notJoined > 0 && <span className="shrink-0 px-2 py-0.5 rounded-md text-[11px] font-bold bg-black text-white/60 ring-1 ring-white/20 whitespace-nowrap">Not joined {selStats.notJoined}</span>}
              </div>
          </div>
      )}

      {/* CELL EDITOR MODAL */}
      {editCell && (
          <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 animate-in zoom-in-95 flex flex-col relative">
                  <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-4">
                      <div>
                          <h3 className="font-black text-xl text-[#6D2158] flex items-center gap-2">
                              <CalIcon size={20}/> {format(parseISO(editCell.dateStr), 'dd MMM yyyy')}
                          </h3>
                          <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">{editCell.hostName}</p>
                      </div>
                      <button onClick={() => setEditCell(null)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors text-slate-500"><X size={18}/></button>
                  </div>
                  
                  <div className="mb-6">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2"><UserCheck size={14}/> Set Status Code</label>
                      <div className="grid grid-cols-4 gap-2">
                          {STATUS_CODES.map(code => {
                              if (code === 'RO') return null; // Kept separate
                              const isSelected = editCell.status === code;
                              return (
                                  <button 
                                      key={code}
                                      onClick={() => setEditCell({...editCell, status: code, roFor: null, note: roForDay(editCell.note) ? '' : editCell.note})}
                                      className={`p-3 rounded-xl text-xs font-black border-2 transition-all active:scale-95 ${isSelected ? 'border-[#6D2158] bg-[#6D2158]/10 text-[#6D2158] shadow-sm' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'}`}
                                  >
                                      {code}
                                  </button>
                              );
                          })}
                          <button 
                              onClick={() => setEditCell({...editCell, status: ''})}
                              className={`p-3 rounded-xl text-xs font-black border-2 transition-all active:scale-95 ${editCell.status === '' ? 'border-rose-500 bg-rose-50 text-rose-600 shadow-sm' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-rose-200 hover:text-rose-500'}`}
                              title="Clear Entry"
                          >
                              CLR
                          </button>
                      </div>

                      {/* --- REBUILT RO WORKFLOW BUTTONS --- */}
                      <div className="mt-4 pt-4 border-t border-slate-100">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1">
                              <AlertTriangle size={12} className="text-amber-500"/> Pending Leave (RO) Actions
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                              <button 
                                  // Earning RO needs a leave code on the day (usually O) + the "working day" comment
                                  onClick={() => setEditCell({...editCell, status: RO_EARNING_CODES.includes(editCell.status) ? editCell.status : 'O', note: hasWorkingNote(editCell.note) ? editCell.note : (editCell.note.trim() ? `WORKING DAY · ${editCell.note.trim()}` : 'WORKING DAY'), roFor: null})}
                                  title="Planned leave, but they worked: earns 1 RO" 
                                  className="py-3 bg-amber-50 text-amber-700 border border-amber-300 rounded-xl text-[10px] font-black uppercase hover:bg-amber-100 transition-colors shadow-sm"
                              >
                                  Worked on leave (+1 RO)
                              </button>
                              <button 
                                  onClick={() => {
                                      const pend = pendingWorkedDays(roRows, editCell.hostId, editCell.origStatus === 'RO' ? editCell.dateStr : undefined);
                                      const keep = editCell.roFor && (pend.some(p => p.date === editCell.roFor) || editCell.roFor === roForDay(editCell.origNote)) ? editCell.roFor : null;
                                      const pick = keep || (pend.length === 1 ? pend[0].date : null);
                                      setEditCell({...editCell, status: 'RO', roFor: pick, note: pick ? roNoteFor(pick) : editCell.note});
                                  }}
                                  className="py-3 bg-yellow-300 text-yellow-900 border border-yellow-400 rounded-xl text-[10px] font-black uppercase hover:bg-yellow-400 transition-colors shadow-sm"
                              >
                                  Take RO (−1 RO)
                              </button>
                          </div>

                          {editCell.status === 'RO' && (() => {
                              // Pending working days, plus the one this RO is already linked to
                              const pend = pendingWorkedDays(roRows, editCell.hostId, editCell.origStatus === 'RO' ? editCell.dateStr : undefined);
                              const linked = roForDay(editCell.origNote);
                              const opts = linked && !pend.some(p => p.date === linked) ? [{ date: linked, status: '', note: '' }, ...pend] : pend;
                              return (
                                  <div className="mt-3 rounded-2xl border border-yellow-300 bg-yellow-50 p-3">
                                      <p className="text-[10px] font-black uppercase tracking-widest text-yellow-800 mb-2">Which working day is this RO for?</p>
                                      {opts.length === 0 ? (
                                          <p className="text-[11px] font-semibold text-rose-600">No pending working days. Add &ldquo;working day&rdquo; on the day they worked first, or the RO balance goes negative.</p>
                                      ) : (
                                          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                                              {opts.map(o => {
                                                  const on = editCell.roFor === o.date;
                                                  return (
                                                      <button key={o.date} type="button" title={o.note || undefined}
                                                          onClick={() => setEditCell({ ...editCell, roFor: o.date, note: roNoteFor(o.date) })}
                                                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-black border transition-colors ${on ? 'bg-yellow-400 border-yellow-500 text-yellow-950' : 'bg-white border-yellow-200 text-yellow-900 hover:bg-yellow-100'}`}>
                                                          {format(parseISO(o.date), 'dd MMM yyyy')}{o.status ? <span className="ml-1 opacity-60 font-bold">{o.status}</span> : null}
                                                      </button>
                                                  );
                                              })}
                                          </div>
                                      )}
                                      {editCell.roFor && <p className="mt-2 text-[10px] font-semibold text-yellow-800">That day&rsquo;s comment becomes &ldquo;{workedNoteWithRO(roRows.find(r => r.host_id === editCell.hostId && r.date === editCell.roFor)?.shift_note, editCell.dateStr)}&rdquo;</p>}
                                  </div>
                              );
                          })()}
                      </div>
                  </div>

                  <div className="mb-4">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2"><Clock size={14}/> Duty / Shift (Optional)</label>
                      <input 
                          type="text"
                          className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold outline-none focus:border-[#6D2158] shadow-inner"
                          placeholder="e.g. Morning, Night, 08:00..."
                          value={editCell.shiftType}
                          onChange={e => setEditCell({...editCell, shiftType: e.target.value})}
                      />
                  </div>

                  <div className="mb-6">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2"><MessageSquareText size={14}/> Comment / Remark (Optional)</label>
                      <textarea 
                          className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-medium outline-none focus:border-[#6D2158] resize-none h-24 shadow-inner"
                          placeholder="Type special instructions here... (Adds red dot)"
                          value={editCell.note}
                          onChange={e => setEditCell({...editCell, note: e.target.value})}
                      />
                  </div>

                  <button 
                      onClick={handleSaveCell}
                      className="w-full py-4 bg-[#6D2158] text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-purple-900/20 hover:bg-[#5a1b49] active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                      <Save size={16}/> Save Entry
                  </button>
              </div>
          </div>
      )}

      {/* ⚡ NEW PENDING LEAVE MODAL ⚡ */}
      {isROModalOpen && (
          <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden animate-in zoom-in-95">
                  <div className="p-6 bg-yellow-400 text-yellow-900 flex justify-between items-center shrink-0">
                      <div>
                          <h3 className="text-xl font-black flex items-center gap-2 tracking-tight"><AlertTriangle size={24}/> RO balance</h3>
                          <p className="text-[10px] text-yellow-800 font-bold uppercase tracking-widest mt-1">OFF given on a working day → RO to give back</p>
                      </div>
                      <button onClick={() => setIsROModalOpen(false)} className="bg-black/10 p-2 rounded-full hover:bg-black/20 transition-colors text-yellow-900"><X size={18}/></button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
                      {(() => {
                          const owed = roLedger.filter(l => l.balance > 0);
                          const check = roLedger.filter(l => l.balance < 0).sort((a, b) => a.balance - b.balance);
                          const renderCard = (l: (typeof roLedger)[number]) => (
                              <div key={l.host.id} className={`p-4 border rounded-2xl ${l.balance < 0 ? 'bg-rose-50/60 border-rose-200' : 'bg-white border-yellow-200'}`}>
                                  <div className="flex justify-between items-start gap-3">
                                      <div className="min-w-0">
                                          <p className="font-black text-slate-800 text-sm truncate">{l.host.full_name}</p>
                                          <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">{l.host.host_id} · worked {l.earned} · RO taken {l.taken}</p>
                                      </div>
                                      <div className="text-right shrink-0">
                                          <span className={`text-xl font-black ${l.balance > 0 ? 'text-amber-600' : 'text-rose-600'}`}>{l.balance}</span>
                                          <span className="block text-[8px] font-bold text-slate-400 uppercase">{l.balance < 0 ? 'more RO than worked' : `RO to give`}</span>
                                      </div>
                                  </div>
                                  {l.balance > 0 && (() => {
                                      // The worked days still waiting for their RO (oldest paid back first).
                                      const open = l.earnedDates.slice(l.taken);
                                      return open.length > 0 && (
                                          <div className="mt-2 flex flex-wrap gap-1.5">
                                              {open.map((d: string) => <span key={d} className="bg-lime-50 border border-lime-200 text-lime-800 px-2 py-1 rounded text-[10px] font-bold">worked {format(parseISO(d), 'dd MMM')}</span>)}
                                          </div>
                                      );
                                  })()}
                                  {l.balance < 0 && (
                                      <p className="mt-1.5 text-[11px] font-semibold text-rose-700">{-l.balance} RO day{l.balance === -1 ? '' : 's'} given, but the day{l.balance === -1 ? '' : 's'} worked {l.balance === -1 ? 'is' : 'are'} not marked OFF with &ldquo;working day&rdquo;.</p>
                                  )}
                              </div>
                          );
                          return (
                            <>
                              {owed.length === 0
                                  ? <div className="text-center py-8 text-slate-400 font-bold">Nobody is owed a working off right now.</div>
                                  : owed.map(renderCard)}
                              {check.length > 0 && (
                                  <details className="pt-2">
                                      <summary className="cursor-pointer text-[11px] font-black uppercase tracking-wider text-rose-600 py-2">Needs checking · {check.length} host{check.length === 1 ? '' : 's'} took more RO than recorded</summary>
                                      <div className="space-y-3 pt-2">{check.map(renderCard)}</div>
                                  </details>
                              )}
                            </>
                          );
                      })()}
                  </div>
              </div>
          </div>
      )}

      {/* ⚡ INSIGHTS MODAL ⚡ */}
      {isInsightsOpen && (
          <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-[#FDFBFD] w-full max-w-5xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
                  
                  {/* Header */}
                  <div className="p-6 bg-blue-600 text-white flex justify-between items-center shrink-0">
                      <div>
                          <h3 className="text-xl font-black flex items-center gap-2 tracking-tight"><BarChart2 size={24}/> Leave Analytics</h3>
                          <p className="text-[10px] text-blue-200 font-bold uppercase tracking-widest mt-1">Live Department Overview</p>
                      </div>
                      <button onClick={() => setIsInsightsOpen(false)} className="bg-black/10 p-2 rounded-full hover:bg-black/20 transition-colors"><X size={18}/></button>
                  </div>

                  {/* Body */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                      
                      {/* Top KPIs */}
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center items-center">
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Total Liability</span>
                              <span className="text-3xl font-black text-rose-600">{insightsData.totalLiability.toFixed(1)}</span>
                              <span className="text-[8px] font-bold uppercase text-slate-400 mt-1">Total Days Owed</span>
                          </div>
                          <div className="bg-yellow-50 p-4 rounded-2xl border border-yellow-200 shadow-sm flex flex-col justify-center items-center">
                              <span className="text-[10px] font-black uppercase tracking-widest text-yellow-600 mb-1">Pending Leaves</span>
                              <span className="text-3xl font-black text-yellow-700">{insightsData.totalRO_Owed}</span>
                              <span className="text-[8px] font-bold uppercase text-yellow-700/60 mt-1">Days Owed (RO)</span>
                          </div>
                          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center items-center">
                              <span className="text-[10px] font-black uppercase tracking-widest text-cyan-500 mb-1">Annual Leave</span>
                              <span className="text-3xl font-black text-cyan-700">{insightsData.totalAL.toFixed(1)}</span>
                              <span className="text-[8px] font-bold uppercase text-slate-400 mt-1">Days Owed</span>
                          </div>
                          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center items-center">
                              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-1">Off Days</span>
                              <span className="text-3xl font-black text-emerald-700">{insightsData.totalOff.toFixed(1)}</span>
                              <span className="text-[8px] font-bold uppercase text-slate-400 mt-1">Days Owed</span>
                          </div>
                          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center items-center">
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">YTD Consumption</span>
                              <span className="text-3xl font-black text-slate-800">{insightsData.totalLeavesTaken}</span>
                              <span className="text-[8px] font-bold uppercase text-slate-400 mt-1">Total Leaves Cleared</span>
                          </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          
                          {/* Monthly Clearance Breakdown */}
                          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col">
                              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-2">
                                  <CalendarDays size={14} className="text-blue-500"/> Monthly Clearance & Sick Leaves
                              </h4>
                              
                              <div className="flex-1 overflow-x-auto">
                                  <table className="w-full text-left">
                                      <thead>
                                          <tr className="text-[9px] uppercase tracking-widest text-slate-400 border-b border-slate-100">
                                              <th className="pb-3 pr-4">Month</th>
                                              <th className="pb-3 px-2 text-emerald-500">Off</th>
                                              <th className="pb-3 px-2 text-cyan-500">AL</th>
                                              <th className="pb-3 px-2 text-blue-500">PH</th>
                                              <th className="pb-3 pl-4 border-l border-slate-100 text-rose-500">Sick Leaves</th>
                                          </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-50">
                                          {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month, idx) => {
                                              const data = insightsData.monthlyStats[idx];
                                              if (data.off === 0 && data.al === 0 && data.ph === 0 && data.sl === 0) return null;

                                              return (
                                                  <tr key={month} className="hover:bg-slate-50 transition-colors">
                                                      <td className="py-3 pr-4 font-bold text-slate-700">{month}</td>
                                                      <td className="py-3 px-2 font-bold text-emerald-700">{data.off || '-'}</td>
                                                      <td className="py-3 px-2 font-bold text-cyan-700">{data.al || '-'}</td>
                                                      <td className="py-3 px-2 font-bold text-blue-700">{data.ph || '-'}</td>
                                                      <td className="py-3 pl-4 border-l border-slate-100">
                                                          <div className="flex items-center gap-3">
                                                              <span className="font-bold text-rose-600">{data.sl || '-'}</span>
                                                              {data.topSickPerson && (
                                                                  <span className="text-[9px] bg-rose-50 text-rose-600 px-2 py-1 rounded-full font-bold flex items-center gap-1 border border-rose-100">
                                                                      <Pill size={10}/> {data.topSickPerson.name} ({data.topSickPerson.count})
                                                                  </span>
                                                              )}
                                                          </div>
                                                      </td>
                                                  </tr>
                                              );
                                          })}
                                      </tbody>
                                  </table>
                              </div>
                          </div>

                          <div className="space-y-6 flex flex-col">
                              {/* Top Liability Staff */}
                              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col flex-1">
                                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-2">
                                      <AlertCircle size={14} className="text-amber-500"/> Highest Overall Balances
                                  </h4>
                                  
                                  <div className="space-y-4">
                                      {insightsData.topOwed.map((host, idx) => (
                                          <div key={host.id} className="flex items-center justify-between group">
                                              <div className="flex items-center gap-3 min-w-0 pr-2">
                                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${idx === 0 ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'}`}>
                                                      {idx + 1}
                                                  </div>
                                                  <div className="truncate">
                                                      <p className="text-sm font-bold text-slate-800 truncate leading-tight group-hover:text-[#6D2158] transition-colors">{host.full_name}</p>
                                                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 truncate leading-tight">{host.role}</p>
                                                  </div>
                                              </div>
                                              <div className="text-right shrink-0">
                                                  <span className="text-sm font-black text-[#6D2158]">{host.balTotal}</span>
                                              </div>
                                          </div>
                                      ))}
                                  </div>
                              </div>
                          </div>

                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* MAGIC PASTE MODAL */}

    </div>
  );
}
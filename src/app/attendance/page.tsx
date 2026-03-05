"use client";
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, Wand2, Loader2, UserCheck, 
  ChevronLeft, ChevronRight, Save, X, Calendar as CalIcon, MessageSquareText, Clock, ArrowRight
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { differenceInDays, parseISO, isAfter, isBefore, format } from 'date-fns';
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

// Global keystroke buffer for fast Excel-like typing
let keyBuffer = '';
let keyTimer: NodeJS.Timeout | null = null;

// --- OPTIMIZED MEMOIZED CELL COMPONENT ---
type AttendanceCellProps = {
    val: string;
    note: string;
    shiftType: string;
    dateStr: string;
    isFriday: boolean;
    isPH: boolean;
    isToday: boolean;
    rIdx: number;
    cIdx: number;
    onOpenEdit: () => void;
    onQuickSave: (status: string, rIdx: number, cIdx: number) => void;
};

const AttendanceCell = React.memo(({ val, note, shiftType, dateStr, isFriday, isPH, isToday, rIdx, cIdx, onOpenEdit, onQuickSave }: AttendanceCellProps) => {
    const colorClass = val ? STATUS_COLORS[val] : 'text-slate-300';
    const bgBase = isToday ? 'bg-amber-50/60 border-amber-200' : isPH ? 'bg-blue-50/50' : isFriday ? 'bg-rose-50/30' : 'bg-white';
    
    // RED DOT: Only shows if there is an actual text note
    const hasNote = !!note && note.trim() !== '';

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTableCellElement>) => {
        // CRITICAL: Stop event from bubbling to the global table handler
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

        if (e.key === 'Enter') {
            e.preventDefault();
            onOpenEdit();
            return;
        }

        if (e.key === 'Backspace' || e.key === 'Delete') {
            e.preventDefault();
            onQuickSave('', rIdx, cIdx);
            return;
        }

        const char = e.key.toUpperCase();
        if (/^[A-Z]$/.test(char)) {
            e.preventDefault();
            keyBuffer += char;
            if (keyTimer) clearTimeout(keyTimer);

            keyTimer = setTimeout(() => {
                const exactMatch = STATUS_CODES.find(c => c === keyBuffer);
                if (exactMatch) {
                    onQuickSave(exactMatch, rIdx, cIdx);
                } else {
                    const fallbackMatch = STATUS_CODES.find(c => c === char);
                    if (fallbackMatch) {
                        onQuickSave(fallbackMatch, rIdx, cIdx);
                    }
                }
                keyBuffer = '';
            }, 300); 
        }
    };

    return (
        <td 
            id={`cell-${rIdx}-${cIdx}`}
            data-r={rIdx}
            data-c={cIdx}
            tabIndex={0}
            onClick={(e) => {
                if (e.detail === 2) onOpenEdit();
            }}
            onKeyDown={handleKeyDown}
            className={`border-b border-r p-0 h-10 w-10 min-w-[40px] max-w-[40px] align-middle cursor-cell transition-colors box-border relative select-none [&.cell-selected]:bg-blue-100 [&.cell-selected]:ring-2 [&.cell-selected]:ring-inset [&.cell-selected]:ring-blue-600 [&.cell-selected]:z-20 ${val ? colorClass : bgBase} ${!isToday && !val ? 'border-slate-200' : ''}`}
        >
            <div className="w-full h-full flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[11px] font-bold leading-none">{val || '-'}</span>
                {/* DUTY TIME: Shows purely as small text below */}
                {shiftType && <span className="text-[7px] leading-none font-bold opacity-60 mt-1 truncate w-full text-center px-0.5">{shiftType}</span>}
            </div>
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
  const [searchQuery, setSearchQuery] = useState('');
  const [publicHolidays, setPublicHolidays] = useState<{date: string, name: string}[]>([]);

  // Cell Edit Modal State
  const [editCell, setEditCell] = useState<{ hostId: string, hostName: string, dateStr: string, status: string, note: string, shiftType: string } | null>(null);

  // Magic Paste State
  const [isMagicOpen, setIsMagicOpen] = useState(false);
  const [magicText, setMagicText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [magicResults, setMagicResults] = useState<any>(null);
  const [linkMappings, setLinkMappings] = useState<Record<string, string>>({});

  // EXCEL ENGINE STATE
  const [isDragging, setIsDragging] = useState(false);
  const selectionRef = useRef({ r1: -1, c1: -1, r2: -1, c2: -1 });

  useEffect(() => { fetchData(); }, [selectedYear]);

  // Seamless Auto-Scroll to Today instantly
  useEffect(() => {
      if (!isLoading && scrollRef.current) {
          requestAnimationFrame(() => {
              const todayCol = document.getElementById('today-col');
              if (todayCol && scrollRef.current) {
                  scrollRef.current.scrollLeft = Math.max(0, todayCol.offsetLeft - 490 - 32); 
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

  // ============================================================================
  // STRICT STRING DATES (PREVENTS ALL TIMEZONE DRIFT)
  // ============================================================================
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

  // ============================================================================
  // BULLETPROOF DATABASE SAVE ENGINE
  // ============================================================================
  const saveToDatabase = async (hostId: string, dateStr: string, status: string, note?: string, shift?: string) => {
      const { data: existingArr, error: fetchErr } = await supabase.from('hsk_attendance')
          .select('id, shift_note, shift_type')
          .eq('host_id', hostId)
          .eq('date', dateStr)
          .limit(1); 
          
      if (fetchErr) throw fetchErr;
      const existing = existingArr?.[0];

      // Clean up accidental duplicates from past bugs
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
  };

  const loadAttendanceOnly = async () => {
      // 🚀 INFINITE PAGINATION LOOP FIX (Never drops data) 🚀
      let allData: any[] = [];
      let from = 0;
      let step = 1000;
      let hasMore = true;

      while (hasMore) {
          const { data, error } = await supabase
              .from('hsk_attendance')
              .select('*')
              .range(from, from + step - 1);

          if (error) {
              console.error("Error fetching attendance:", error);
              break;
          }

          if (data && data.length > 0) {
              allData.push(...data);
              from += step;
              if (data.length < step) hasMore = false;
          } else {
              hasMore = false;
          }
      }

      if (allData.length > 0) {
          const normalizedAtt = allData.map(a => ({
              ...a,
              date: a.date.includes('T') ? a.date.split('T')[0] : a.date 
          }));
          setAttendance(normalizedAtt);
      } else {
          setAttendance([]);
      }
  };

  const fetchData = async () => {
    setIsLoading(true);
    setIsScrolled(false);
    
    const { data: constData } = await supabase.from('hsk_constants').select('*').in('type', ['public_holiday', 'role_rank']);
    
    let roleRanks: Record<string, number> = {};
    if (constData) {
        const parsedHolidays = constData
            .filter(c => c.type === 'public_holiday')
            .map((c: any) => {
                const [d, n] = c.label.split('::');
                return { date: d, name: n };
            });
        setPublicHolidays(parsedHolidays);

        constData.filter(c => c.type === 'role_rank').forEach(c => {
            const [role, rank] = c.label.split('::');
            if (role && rank) roleRanks[role.toLowerCase().trim()] = parseInt(rank, 10);
        });
    }

    const { data: hostData } = await supabase.from('hsk_hosts').select('*').neq('status', 'Resigned');
    
    if (hostData) {
        const sortedHosts = hostData.sort((a, b) => {
            const rankA = roleRanks[(a.role || '').toLowerCase().trim()] ?? 999;
            const rankB = roleRanks[(b.role || '').toLowerCase().trim()] ?? 999;
            if (rankA !== rankB) return rankA - rankB;
            
            const numA = parseInt((a.host_id || '').replace(/\D/g, ''), 10) || 999999;
            const numB = parseInt((b.host_id || '').replace(/\D/g, ''), 10) || 999999;
            return numA - numB;
        });
        setHosts(sortedHosts);
    }

    await loadAttendanceOnly();
    setIsLoading(false);
  };

  const hostBalances = useMemo(() => {
    const targetDate = parseISO(cutoffDate);
    const SYSTEM_START_DATE = new Date(2026, 0, 1); 
    
    return hosts.map(host => {
      const baseCfOff = host.cf_off || 0;
      const baseCfAL = host.cf_al || 0;
      const baseCfPH = host.cf_ph || 0;

      const joinDate = host.joining_date ? parseISO(host.joining_date) : SYSTEM_START_DATE;
      const isExec = ['DA', 'DB'].includes(host.host_level);
      const isIntern = (host.role || '').toLowerCase().includes('intern');

      const hostRecords = attendance.filter(a => a.host_id === host.host_id);
      
      // ONLY pull records that happen ON OR BEFORE the target (cutoff) date
      const recordsUpToTarget = hostRecords.filter(a => {
          const d = parseISO(a.date);
          return d >= SYSTEM_START_DATE && d <= targetDate;
      });

      // Deductions only happen if the date has arrived
      const recordsForDeduction = recordsUpToTarget;

      const accrualStart = isAfter(joinDate, SYSTEM_START_DATE) ? joinDate : SYSTEM_START_DATE;
      
      let earnedOff = 0;
      let earnedAL = 0;
      let earnedPH = 0;

      if (targetDate >= accrualStart) {
          const daysActive = differenceInDays(targetDate, accrualStart) + 1;
          const penaltyDays = recordsUpToTarget.filter(a => ['NP', 'A'].includes(a.status_code)).length;
          const eligibleDays = Math.max(0, daysActive - penaltyDays);
          
          earnedOff = eligibleDays / 7;
          earnedAL = eligibleDays / 12;
      }

      publicHolidays.forEach(ph => {
          const phDate = parseISO(ph.date);
          if (phDate >= accrualStart && phDate <= targetDate) {
              earnedPH += 1;
          }
      });

      const takenOff = recordsForDeduction.filter(a => a.status_code === 'O').length;
      const takenAL = recordsForDeduction.filter(a => a.status_code === 'AL').length;
      const takenPH = recordsForDeduction.filter(a => a.status_code === 'PH').length;

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

      const balOffVal = baseCfOff + earnedOff - takenOff;
      const balALVal = isIntern ? 0 : (baseCfAL + earnedAL - takenAL);
      const balPHVal = baseCfPH + earnedPH - takenPH;
      const balRRVal = isExec ? 7 - takenRR : 0;
      const totalBal = balOffVal + balALVal + balPHVal + balRRVal;

      return {
        ...host,
        balOff: balOffVal.toFixed(1),
        balAL: isIntern ? '0.0' : balALVal.toFixed(1),
        balPH: balPHVal.toFixed(1),
        balRR: isExec ? balRRVal.toString() : '-',
        balTotal: totalBal.toFixed(1),
        balSL: 30 - takenSL,
        balEL: 10 - takenEL
      };
    });
  }, [hosts, attendance, cutoffDate, publicHolidays]);

  const filteredHosts = hostBalances.filter(h => h.full_name.toLowerCase().includes(searchQuery.toLowerCase()) || h.host_id.toLowerCase().includes(searchQuery.toLowerCase()));

  // --- EXCEL ENGINE FUNCTIONS ---

  const updateSelectionVisuals = () => {
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
  };

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

  const applyBulkStatus = async (status: string) => {
      const { r1, c1, r2, c2 } = selectionRef.current;
      if (r1 === -1) return;

      // Keep the focus stable after the bulk update completes
      lastFocusedCell.current = `cell-${r2}-${c2}`;

      const minR = Math.min(r1, r2); const maxR = Math.max(r1, r2);
      const minC = Math.min(c1, c2); const maxC = Math.max(c1, c2);

      // Instantly Update UI Optimistically 
      setAttendance(prev => {
          const newAtt = [...prev];
          for (let r = minR; r <= maxR; r++) {
              for (let c = minC; c <= maxC; c++) {
                  const hostId = filteredHosts[r].host_id;
                  const dateStr = daysInYear[c];
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

      // Background DB Sync - safely reuses the robust single cell save logic!
      const dbTask = async () => {
          for (let r = minR; r <= maxR; r++) {
              for (let c = minC; c <= maxC; c++) {
                  const hostId = filteredHosts[r].host_id;
                  const dateStr = daysInYear[c];
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
  };

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
          const record = attendance.find(a => a.host_id === host.host_id && a.date === dateStr);
          setEditCell({ hostId: host.host_id, hostName: host.full_name, dateStr, status: record?.status_code || '', note: record?.shift_note || '', shiftType: record?.shift_type || '' });
          return;
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
          e.preventDefault();
          applyBulkStatus('');
          return;
      }
      // No more A-Z processing here, handled in Cell component
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
              const val = attendance.find(a => a.host_id === hostId && a.date === dateStr)?.status_code || '';
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

  const quickSaveCell = async (hostId: string, dateStr: string, status: string, rIdx: number, cIdx: number) => {
      lastFocusedCell.current = `cell-${rIdx}-${cIdx}`; 
      
      // Optimistic UI Update Instantly
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
  };

  const handleSaveCell = async () => {
    if (!editCell) return;
    const { hostId, dateStr, status, note, shiftType } = editCell;
    
    // Optimistic UI Update Instantly
    setAttendance(prev => {
        const newAtt = [...prev];
        const existingIdx = newAtt.findIndex(a => a.host_id === hostId && a.date === dateStr);
        if (status === '' && (!note || note.trim() === '') && (!shiftType || shiftType.trim() === '')) {
            if (existingIdx > -1) newAtt.splice(existingIdx, 1);
        } else {
            if (existingIdx > -1) {
                newAtt[existingIdx] = { ...newAtt[existingIdx], status_code: status, shift_note: note, shift_type: shiftType };
            } else {
                newAtt.push({ host_id: hostId, date: dateStr, status_code: status, shift_note: note, shift_type: shiftType });
            }
        }
        return newAtt;
    });

    toast.promise(saveToDatabase(hostId, dateStr, status, note, shiftType), {
        loading: 'Saving entry...',
        success: 'Entry saved',
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

  const handleMagicParse = async () => {
    if (!magicText.trim()) return;
    setIsParsing(true);
    setLinkMappings({}); 
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

    for (const [unrecName, hostId] of Object.entries(linkMappings)) {
        if (!hostId) continue;
        const host = hosts.find(h => h.host_id === hostId);
        if (host) {
            const existingNicks = host.nicknames ? host.nicknames.split(',').map((s: string) => s.trim()) : [];
            if (!existingNicks.includes(unrecName)) {
                existingNicks.push(unrecName);
                const newNicksStr = existingNicks.join(', ');
                await supabase.from('hsk_hosts').update({ nicknames: newNicksStr }).eq('host_id', hostId);
            }
            magicResults.records.push({
                host_id: hostId,
                full_name: host.full_name,
                status_code: 'P', 
                shift_type: ''
            });
        }
    }
    
    const dbTask = async () => {
        for (const r of magicResults.records) {
            await saveToDatabase(r.host_id, magicResults.date, r.status_code, undefined, r.shift_type);
        }
    };

    toast.promise(dbTask(), {
        loading: 'Applying roster...',
        success: 'Roster applied successfully',
        error: 'Failed to apply roster'
    }).then(() => {
        setIsParsing(false);
        setIsMagicOpen(false);
        setMagicText('');
        setMagicResults(null);
        setLinkMappings({});
        fetchData(); // Trigger full refresh to align UI
    });
  };

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
                <input type="text" placeholder="Search Host..." className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl font-bold text-xs bg-slate-50 focus:bg-white focus:border-[#6D2158] outline-none transition-all shadow-inner" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>

            <button onClick={() => setIsMagicOpen(true)} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-md hover:bg-emerald-700 transition-all mt-5">
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
                              {filteredHosts.map((host, hostIdx) => (
                                  <tr key={host.id} className="hover:bg-slate-50/50 transition-colors group">
                                      <td className="max-md:static md:sticky md:left-0 z-50 bg-white border-b border-r border-slate-200 p-2 text-center font-black text-slate-300 w-[40px] min-w-[40px] max-w-[40px] box-border">
                                          {hostIdx + 1}
                                      </td>

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
                                      
                                      <td className="max-md:static md:sticky md:left-[280px] z-50 bg-emerald-50 group-hover:bg-emerald-100 border-b border-r border-slate-200 p-2 text-center font-black text-emerald-700 w-[40px] min-w-[40px] max-w-[40px] box-border">{host.balOff}</td>
                                      <td className="max-md:static md:sticky md:left-[320px] z-50 bg-cyan-50 group-hover:bg-cyan-100 border-b border-r border-slate-200 p-2 text-center font-black text-cyan-700 w-[40px] min-w-[40px] max-w-[40px] box-border">{host.balAL}</td>
                                      <td className="max-md:static md:sticky md:left-[360px] z-50 bg-blue-50 group-hover:bg-blue-100 border-b border-r border-slate-200 p-2 text-center font-black text-blue-700 w-[40px] min-w-[40px] max-w-[40px] box-border">{host.balPH}</td>
                                      <td className="max-md:static md:sticky md:left-[400px] z-50 bg-fuchsia-50 group-hover:bg-fuchsia-100 border-b border-r border-slate-200 p-2 text-center font-black text-fuchsia-700 w-[40px] min-w-[40px] max-w-[40px] box-border">{host.balRR}</td>
                                      <td className="max-md:static md:sticky md:left-[440px] z-50 bg-purple-100 group-hover:bg-purple-200 border-b border-r-2 border-slate-300 p-2 text-center font-black text-purple-900 w-[50px] min-w-[50px] max-w-[50px] box-border shadow-[2px_0_5px_rgba(0,0,0,0.1)]">{host.balTotal}</td>

                                      {daysInYear.map((dateStr, dateIdx) => {
                                          const record = attendance.find(a => a.host_id === host.host_id && a.date === dateStr);
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
                                                  val={val}
                                                  note={note || ''}
                                                  shiftType={shift || ''}
                                                  dateStr={dateStr}
                                                  isFriday={isFriday}
                                                  isPH={isPH}
                                                  isToday={isToday}
                                                  rIdx={hostIdx}
                                                  cIdx={dateIdx}
                                                  onOpenEdit={() => {
                                                      selectionRef.current = { r1: hostIdx, c1: dateIdx, r2: hostIdx, c2: dateIdx };
                                                      updateSelectionVisuals();
                                                      setEditCell({ hostId: host.host_id, hostName: host.full_name, dateStr: dateStr, status: val, note: note || '', shiftType: shift || '' })
                                                  }}
                                                  onQuickSave={(newStatus, r, c) => {
                                                      const { r1, c1, r2, c2 } = selectionRef.current;
                                                      // Detect if the user has dragged and selected multiple cells
                                                      const isMultiSelect = r1 !== -1 && (r1 !== r2 || c1 !== c2);
                                                      
                                                      if (isMultiSelect) {
                                                          applyBulkStatus(newStatus);
                                                      } else {
                                                          quickSaveCell(host.host_id, dateStr, newStatus, r, c);
                                                      }
                                                  }}
                                              />
                                          );
                                      })}

                                      <td className={`bg-rose-50/50 group-hover:bg-rose-50 border-b border-r border-slate-200 p-2 text-center font-black w-[40px] min-w-[40px] max-w-[40px] box-border ${host.balSL < 5 ? 'text-rose-600' : 'text-slate-700'}`}>{host.balSL}</td>
                                      <td className="bg-orange-50/50 group-hover:bg-orange-50 border-b border-r-2 border-slate-300 p-2 text-center font-black text-orange-700 w-[40px] min-w-[40px] max-w-[40px] box-border">{host.balEL}</td>

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
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 block flex items-center gap-2"><UserCheck size={14}/> Set Status Code</label>
                      <div className="grid grid-cols-4 gap-2">
                          {STATUS_CODES.map(code => {
                              const isSelected = editCell.status === code;
                              return (
                                  <button 
                                      key={code}
                                      onClick={() => setEditCell({...editCell, status: code})}
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
                  </div>

                  <div className="mb-4">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 block flex items-center gap-2"><Clock size={14}/> Duty / Shift (Optional)</label>
                      <input 
                          type="text"
                          className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold outline-none focus:border-[#6D2158] shadow-inner"
                          placeholder="e.g. Morning, Night, 08:00..."
                          value={editCell.shiftType}
                          onChange={e => setEditCell({...editCell, shiftType: e.target.value})}
                      />
                  </div>

                  <div className="mb-6">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 block flex items-center gap-2"><MessageSquareText size={14}/> Comment / Remark (Optional)</label>
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

      {/* MAGIC PASTE MODAL */}
      {isMagicOpen && (
          <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
                  <div className="p-5 bg-emerald-600 text-white flex justify-between items-center shrink-0">
                      <div>
                          <h3 className="text-lg font-black flex items-center gap-2"><Wand2 size={20}/> Magic Roster Parse</h3>
                          <p className="text-xs text-emerald-100 font-medium mt-1">Paste WhatsApp message. AI will link names and shifts automatically.</p>
                      </div>
                      <button onClick={() => { setIsMagicOpen(false); setMagicResults(null); setMagicText(''); }} className="bg-black/10 p-2 rounded-full hover:bg-black/20"><X size={18}/></button>
                  </div>

                  <div className="flex-1 flex flex-col md:flex-row min-h-0">
                      {/* INPUT AREA */}
                      <div className="w-full md:w-[40%] p-5 border-b md:border-b-0 md:border-r border-slate-200 flex flex-col gap-3 shrink-0">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Paste Message Here</label>
                          <textarea 
                              className="flex-1 p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono outline-none focus:border-emerald-500 resize-none shadow-inner"
                              placeholder="e.g.&#10;Tomorrow's Duty:&#10;Off: Nimal, Ziyad&#10;Morning: Shamil, Eeku"
                              value={magicText}
                              onChange={e => setMagicText(e.target.value)}
                          />
                          <button 
                              onClick={handleMagicParse} 
                              disabled={isParsing || !magicText}
                              className="w-full py-4 bg-slate-800 text-white rounded-xl font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
                          >
                              {isParsing ? <Loader2 size={16} className="animate-spin"/> : <Wand2 size={16}/>}
                              Parse with AI
                          </button>
                      </div>

                      {/* RESULTS AREA */}
                      <div className="w-full md:w-[60%] p-0 flex flex-col bg-slate-50 overflow-hidden">
                          {!magicResults ? (
                              <div className="flex-1 flex flex-col items-center justify-center text-slate-300 p-8 text-center">
                                  <CalIcon size={48} strokeWidth={1} className="mb-4 opacity-50"/>
                                  <p className="font-bold text-sm">Awaiting Input</p>
                                  <p className="text-xs mt-2">Results will appear here for review before saving.</p>
                              </div>
                          ) : (
                              <div className="flex flex-col h-full">
                                  <div className="p-4 bg-white border-b border-slate-200 shrink-0 flex justify-between">
                                      <div>
                                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Detected Date: <span className="text-[#6D2158] ml-1">{magicResults.date}</span></p>
                                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Department: <span className="text-emerald-600 ml-1">{magicResults.department}</span></p>
                                      </div>
                                      <div className="text-right">
                                          <span className="text-2xl font-black text-slate-800">{magicResults.records.length}</span>
                                          <p className="text-[10px] font-bold text-slate-400 uppercase">Matches</p>
                                      </div>
                                  </div>
                                  
                                  <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                                      
                                      {/* UNRECOGNIZED NAMES MAPPING UI */}
                                      {magicResults.unrecognized && magicResults.unrecognized.length > 0 && (
                                          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
                                              <h4 className="text-xs font-black text-rose-700 uppercase tracking-widest mb-3 flex items-center gap-2">
                                                  Unrecognized Staff ({magicResults.unrecognized.length})
                                              </h4>
                                              <div className="space-y-3">
                                                  {magicResults.unrecognized.map((name: string, idx: number) => (
                                                      <div key={idx} className="flex items-center gap-3">
                                                          <div className="w-1/3 font-bold text-sm text-slate-700 truncate" title={name}>"{name}"</div>
                                                          <ArrowRight size={14} className="text-slate-400 shrink-0"/>
                                                          <select 
                                                              className="flex-1 p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-rose-400"
                                                              value={linkMappings[name] || ''}
                                                              onChange={(e) => setLinkMappings({...linkMappings, [name]: e.target.value})}
                                                          >
                                                              <option value="">-- Ignore --</option>
                                                              {hosts.map(h => (
                                                                  <option key={h.host_id} value={h.host_id}>{h.full_name} ({h.host_id})</option>
                                                              ))}
                                                          </select>
                                                      </div>
                                                  ))}
                                              </div>
                                              <p className="text-[10px] font-bold text-rose-500 mt-3 italic">Linking a name will permanently save it as their nickname.</p>
                                          </div>
                                      )}

                                      {/* RECOGNIZED RECORDS */}
                                      {magicResults.records.length > 0 && (
                                          <div className="space-y-2">
                                              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Matched Records</h4>
                                              {magicResults.records.map((r: any, idx: number) => (
                                                  <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200 flex justify-between items-center shadow-sm">
                                                      <div>
                                                          <p className="font-bold text-slate-800 text-sm">{r.full_name}</p>
                                                          <p className="text-[10px] text-slate-400 font-mono">{r.host_id}</p>
                                                      </div>
                                                      <div className="text-right">
                                                          <span className={`px-2 py-1 rounded text-xs font-black ${STATUS_COLORS[r.status_code] || 'bg-slate-100 text-slate-600'}`}>{r.status_code}</span>
                                                          {r.shift_type && <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">{r.shift_type}</p>}
                                                      </div>
                                                  </div>
                                              ))}
                                          </div>
                                      )}
                                      
                                      {magicResults.records.length === 0 && (!magicResults.unrecognized || magicResults.unrecognized.length === 0) && (
                                          <p className="text-center text-slate-400 italic text-sm mt-10">No valid staff matched.</p>
                                      )}
                                  </div>
                                  <div className="p-4 bg-white border-t border-slate-200 shrink-0">
                                      <button 
                                          onClick={handleMagicSave} 
                                          disabled={isParsing || (magicResults.records.length === 0 && Object.values(linkMappings).filter(Boolean).length === 0)}
                                          className="w-full py-4 bg-emerald-600 text-white rounded-xl font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-lg hover:bg-emerald-700 disabled:opacity-50"
                                      >
                                          {isParsing ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>}
                                          Apply & Save Roster
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
"use client";
import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Loader2, User, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, format, isSameMonth, isSameDay } from 'date-fns';

export default function MySchedulePage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [attendance, setAttendance] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [hostInfo, setHostInfo] = useState<{name: string, id: string} | null>(null);

  useEffect(() => {
    // 1. Get logged in user from session
    const sessionData = localStorage.getItem('hk_pulse_session');
    if (sessionData) {
        const parsed = JSON.parse(sessionData);
        setHostInfo({ name: parsed.full_name, id: parsed.host_id });
        fetchSchedule(parsed.host_id, currentMonth);
    } else {
        setIsLoading(false);
    }
  }, [currentMonth]);

  const fetchSchedule = async (hostId: string, monthDate: Date) => {
    setIsLoading(true);
    
    // Get first and last day of the visible calendar grid
    const startDate = format(startOfWeek(startOfMonth(monthDate)), 'yyyy-MM-dd');
    const endDate = format(endOfWeek(endOfMonth(monthDate)), 'yyyy-MM-dd');

    const { data } = await supabase
        .from('hsk_attendance')
        .select('date, status_code, shift_type')
        .eq('host_id', hostId)
        .gte('date', startDate)
        .lte('date', endDate);

    if (data) {
        const attMap: Record<string, any> = {};
        data.forEach((row) => {
            attMap[row.date] = row;
        });
        setAttendance(attMap);
    }
    
    setIsLoading(false);
  };

  const nextMonth = () => {
      const d = new Date(currentMonth);
      d.setMonth(d.getMonth() + 1);
      setCurrentMonth(d);
  };
  
  const prevMonth = () => {
      const d = new Date(currentMonth);
      d.setMonth(d.getMonth() - 1);
      setCurrentMonth(d);
  };

  // --- DESKTOP-FRIENDLY CALENDAR GRID RENDERER ---
  const renderCells = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const rows = [];
    let days = [];
    let day = startDate;

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const dateStr = format(day, 'yyyy-MM-dd');
        const record = attendance[dateStr];
        const isCurrentMonth = isSameMonth(day, monthStart);
        const isToday = isSameDay(day, new Date());

        const status = record?.status_code || '';
        const duty = record?.shift_type || '';

        // Color Logic
        let bgClass = 'bg-white hover:bg-slate-50 border-slate-200';
        let textClass = 'text-slate-700';
        let badgeClass = 'bg-slate-100 text-slate-500 border-slate-200';

        if (status === 'O' || status === 'OFF') { 
            bgClass = 'bg-blue-50/50 border-blue-100 hover:bg-blue-50'; 
            textClass = 'text-blue-800'; 
            badgeClass = 'bg-blue-100 text-blue-700 border-blue-200';
        } else if (status === 'AL' || status === 'VAC') { 
            bgClass = 'bg-cyan-50/50 border-cyan-100 hover:bg-cyan-50'; 
            textClass = 'text-cyan-800'; 
            badgeClass = 'bg-cyan-100 text-cyan-700 border-cyan-200';
        } else if (status === 'P') { 
            bgClass = 'bg-emerald-50/50 border-emerald-100 hover:bg-emerald-50'; 
            textClass = 'text-emerald-800'; 
            badgeClass = 'bg-emerald-100 text-emerald-700 border-emerald-200';
        } else if (status === 'SL' || status === 'A' || status === 'NP') { 
            bgClass = 'bg-rose-50/50 border-rose-100 hover:bg-rose-50'; 
            textClass = 'text-rose-800'; 
            badgeClass = 'bg-rose-100 text-rose-700 border-rose-200';
        } else if (status === 'PH' || status === 'RR') { 
            bgClass = 'bg-fuchsia-50/50 border-fuchsia-100 hover:bg-fuchsia-50'; 
            textClass = 'text-fuchsia-800'; 
            badgeClass = 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200';
        }

        if (!isCurrentMonth) {
            bgClass = 'bg-slate-50/50 border-transparent opacity-40';
        }

        days.push(
          <div 
            key={dateStr} 
            className={`min-h-[90px] xl:min-h-[110px] p-2 xl:p-3 flex flex-col rounded-2xl border-2 transition-all ${bgClass} ${isToday ? 'ring-2 ring-[#6D2158] ring-offset-2 shadow-md transform scale-105 z-10 bg-white' : ''}`}
          >
             <span className={`text-sm xl:text-lg font-black mb-1 ${isToday ? 'text-[#6D2158]' : textClass}`}>
                 {format(day, 'd')}
             </span>
             
             {isCurrentMonth && status && (
                 <span className={`px-2 py-0.5 rounded-lg text-[9px] xl:text-[10px] font-black uppercase tracking-widest w-fit mb-1 border shadow-sm ${badgeClass}`}>
                     {status}
                 </span>
             )}

             {isCurrentMonth && duty && (
                 <div className={`mt-auto flex items-center gap-1 text-[9px] xl:text-[10px] font-bold uppercase ${textClass} opacity-80`}>
                     <Clock size={10} className="shrink-0"/> <span className="truncate">{duty}</span>
                 </div>
             )}
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(<div className="grid grid-cols-7 gap-2 xl:gap-4 mb-2 xl:mb-4" key={day.toString()}>{days}</div>);
      days = [];
    }
    return <div className="mt-2">{rows}</div>;
  };

  if (!hostInfo) return <div className="min-h-screen bg-[#FDFBFD] flex justify-center items-center"><Loader2 className="animate-spin text-[#6D2158]" size={32}/></div>;

  return (
    <div className="min-h-screen bg-[#FDFBFD] p-4 sm:p-6 pb-24 font-antiqua text-[#6D2158] max-w-6xl mx-auto">
      
      {/* HEADER */}
      <div className="flex flex-col mb-8 bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
         <div className="flex items-center gap-4">
             <div className="w-14 h-14 bg-[#6D2158] text-white rounded-full flex items-center justify-center font-bold text-xl shadow-md shrink-0">
                 {hostInfo.name.charAt(0)}
             </div>
             <div>
                 <h1 className="text-2xl font-black tracking-tight text-slate-800 line-clamp-1">{hostInfo.name}</h1>
                 <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1 flex items-center gap-1">
                    <User size={12}/> Host ID: {hostInfo.id}
                 </p>
             </div>
         </div>
      </div>

      {/* CALENDAR CONTROLS & GRID */}
      <div className="bg-white p-4 sm:p-6 xl:p-8 rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden">
          <div className="flex justify-between items-center mb-6">
              <button onClick={prevMonth} className="p-3 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-500 transition-colors shadow-sm"><ChevronLeft size={20}/></button>
              <div className="text-center">
                  <h2 className="text-lg xl:text-xl font-black uppercase tracking-widest text-[#6D2158] flex items-center justify-center gap-2">
                      <CalendarIcon size={20}/> {format(currentMonth, 'MMMM yyyy')}
                  </h2>
              </div>
              <button onClick={nextMonth} className="p-3 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-500 transition-colors shadow-sm"><ChevronRight size={20}/></button>
          </div>

          {/* DAY NAMES */}
          <div className="grid grid-cols-7 gap-2 xl:gap-4 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                  <div key={d} className="text-center text-[10px] xl:text-xs font-black uppercase text-slate-400 tracking-widest">
                      {d}
                  </div>
              ))}
          </div>

          {/* GRID */}
          {isLoading ? (
              <div className="h-[400px] flex justify-center items-center"><Loader2 className="animate-spin text-[#6D2158]" size={32}/></div>
          ) : (
              renderCells()
          )}
      </div>

    </div>
  );
}
"use client";
import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Loader2, Coffee, Sun, Moon, Plane, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, format, isSameMonth, isSameDay, parseISO } from 'date-fns';

type Shift = {
  id: string;
  date: string;
  shift_type: string;
};

export default function MySchedulePage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [shifts, setShifts] = useState<Record<string, string>>({});
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
        .from('hsk_roster')
        .select('date, shift_type')
        .eq('host_id', hostId)
        .gte('date', startDate)
        .lte('date', endDate);

    if (data) {
        const shiftMap: Record<string, string> = {};
        data.forEach((row: Shift) => {
            shiftMap[row.date] = row.shift_type;
        });
        setShifts(shiftMap);
    }
    
    setIsLoading(false);
  };

  const nextMonth = () => setCurrentMonth(addDays(currentMonth, 31));
  const prevMonth = () => setCurrentMonth(addDays(currentMonth, -31));

  // --- CALENDAR GRID RENDERER ---
  const renderCells = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const rows = [];
    let days = [];
    let day = startDate;
    let formattedDate = '';

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        formattedDate = format(day, 'yyyy-MM-dd');
        const shiftType = shifts[formattedDate];
        const isCurrentMonth = isSameMonth(day, monthStart);
        const isToday = isSameDay(day, new Date());

        // Styling logic based on shift type
        let bgStyle = 'bg-white text-slate-700';
        let icon = null;

        if (shiftType === 'OFF') {
            bgStyle = 'bg-blue-50 border-blue-200 text-blue-700';
            icon = <Coffee size={14} className="text-blue-500 mb-1" />;
        } else if (shiftType === 'Morning') {
            bgStyle = 'bg-emerald-50 border-emerald-200 text-emerald-700';
            icon = <Sun size={14} className="text-emerald-500 mb-1" />;
        } else if (shiftType === 'Evening') {
            bgStyle = 'bg-indigo-50 border-indigo-200 text-indigo-700';
            icon = <Moon size={14} className="text-indigo-500 mb-1" />;
        } else if (shiftType === 'VAC') {
            bgStyle = 'bg-amber-50 border-amber-200 text-amber-700';
            icon = <Plane size={14} className="text-amber-500 mb-1" />;
        }

        if (!isCurrentMonth) {
            bgStyle = 'bg-slate-50 text-slate-300 border-transparent';
            icon = null;
        }

        days.push(
          <div key={day.toString()} className={`aspect-square p-1 sm:p-2 flex flex-col items-center justify-center rounded-xl sm:rounded-2xl border-2 transition-all ${bgStyle} ${isToday ? 'ring-2 ring-[#6D2158] ring-offset-2' : ''}`}>
             {icon}
             <span className={`text-sm sm:text-lg font-black ${!isCurrentMonth ? 'opacity-50' : ''}`}>{format(day, 'd')}</span>
             {shiftType && isCurrentMonth && (
                 <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-wider mt-1">{shiftType}</span>
             )}
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(<div className="grid grid-cols-7 gap-2 sm:gap-3 mb-2 sm:mb-3" key={day.toString()}>{days}</div>);
      days = [];
    }
    return <div className="mt-4">{rows}</div>;
  };

  if (!hostInfo) return <div className="min-h-screen bg-[#FDFBFD] flex justify-center items-center"><Loader2 className="animate-spin text-[#6D2158]" size={32}/></div>;

  return (
    <div className="min-h-screen bg-[#FDFBFD] p-4 sm:p-6 pb-24 font-antiqua text-[#6D2158] max-w-3xl mx-auto">
      
      {/* HEADER */}
      <div className="flex flex-col mb-8 bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
         <div className="flex items-center gap-4 mb-4">
             <div className="w-14 h-14 bg-[#6D2158] text-white rounded-full flex items-center justify-center font-bold text-xl shadow-md">
                 {hostInfo.name.charAt(0)}
             </div>
             <div>
                 <h1 className="text-2xl font-black tracking-tight text-slate-800">{hostInfo.name}</h1>
                 <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1 flex items-center gap-1">
                    <User size={12}/> Host ID: {hostInfo.id}
                 </p>
             </div>
         </div>
      </div>

      {/* CALENDAR CONTROLS */}
      <div className="bg-white p-4 sm:p-6 rounded-[2rem] shadow-xl border border-slate-100">
          <div className="flex justify-between items-center mb-6">
              <button onClick={prevMonth} className="p-3 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"><ChevronLeft size={20}/></button>
              <h2 className="text-xl font-black uppercase tracking-widest text-[#6D2158] flex items-center gap-2">
                  <CalendarIcon size={20}/> {format(currentMonth, 'MMMM yyyy')}
              </h2>
              <button onClick={nextMonth} className="p-3 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"><ChevronRight size={20}/></button>
          </div>

          {/* DAY NAMES */}
          <div className="grid grid-cols-7 gap-2 sm:gap-3 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                  <div key={d} className="text-center text-[10px] sm:text-xs font-black uppercase text-slate-400 tracking-widest">
                      {d}
                  </div>
              ))}
          </div>

          {/* GRID */}
          {isLoading ? (
              <div className="h-64 flex justify-center items-center"><Loader2 className="animate-spin text-[#6D2158]" size={32}/></div>
          ) : (
              renderCells()
          )}
      </div>

    </div>
  );
}
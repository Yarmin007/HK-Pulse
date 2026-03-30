"use client";
import React, { useState } from 'react';
import { 
  Printer, X, Download, Plane, CalendarDays 
} from 'lucide-react';

// Child Components
import DepartureMode from './components/DepartureMode';
import FlightRequestMode from './components/FlightRequestMode';
import LeaveRequestMode from './components/LeaveRequestMode';

type Mode = 'DASHBOARD' | 'DEPARTURE' | 'FLIGHT' | 'LEAVE';

export default function PrintHubPage() {
  const [activeMode, setActiveMode] = useState<Mode>('DASHBOARD');

  return (
    <div className="absolute inset-0 md:left-64 pt-16 md:pt-0 flex flex-col bg-[#FDFBFD] font-sans text-slate-800 overflow-hidden">
      
      {/* HEADER */}
      <div className="flex-none mb-4 flex justify-between items-center shrink-0 p-4 md:p-6 pb-0">
          <div>
              <h1 className="text-2xl font-bold text-[#6D2158] flex items-center gap-2">
                <Printer/> Print Hub
              </h1>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wide">
                Automated PDF Generation
              </p>
          </div>
          {activeMode !== 'DASHBOARD' && (
              <button 
                onClick={() => setActiveMode('DASHBOARD')} 
                className="bg-slate-200 hover:bg-slate-300 text-slate-600 px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-colors active:scale-95"
              >
                  <X size={16}/> Close
              </button>
          )}
      </div>

      {/* CONTENT AREA */}
      <div className="flex-1 p-4 md:p-6 pt-0 overflow-hidden flex flex-col">
          
          {/* DASHBOARD MENU */}
          {activeMode === 'DASHBOARD' && (
              <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 content-start animate-in fade-in">
                  <button onClick={() => setActiveMode('DEPARTURE')} className="bg-white p-6 rounded-2xl shadow-sm border-2 border-[#6D2158]/10 hover:border-[#6D2158] text-left transition-all group h-auto md:h-40 flex flex-col justify-center active:scale-95">
                      <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><Download size={28}/></div>
                      <h3 className="text-lg font-bold text-slate-800">Dep. Laundry Letter</h3>
                      <p className="text-xs text-slate-400 mt-2">Bulk Generate (PDF/Excel)</p>
                  </button>

                  <button onClick={() => setActiveMode('FLIGHT')} className="bg-white p-6 rounded-2xl shadow-sm border-2 border-[#6D2158]/10 hover:border-[#6D2158] text-left transition-all group h-auto md:h-40 flex flex-col justify-center active:scale-95">
                      <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><Plane size={28}/></div>
                      <h3 className="text-lg font-bold text-slate-800">Flight Request Form</h3>
                      <p className="text-xs text-slate-400 mt-2">Generate Host Ticket Requisition</p>
                  </button>

                  <button onClick={() => setActiveMode('LEAVE')} className="bg-white p-6 rounded-2xl shadow-sm border-2 border-[#6D2158]/10 hover:border-[#6D2158] text-left transition-all group h-auto md:h-40 flex flex-col justify-center active:scale-95">
                      <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><CalendarDays size={28}/></div>
                      <h3 className="text-lg font-bold text-slate-800">Leave Request Form</h3>
                      <p className="text-xs text-slate-400 mt-2">Auto-Detect & Generate Documents</p>
                  </button>
              </div>
          )}

          {/* INDIVIDUAL MODULES */}
          {activeMode === 'DEPARTURE' && <DepartureMode />}
          {activeMode === 'FLIGHT' && <FlightRequestMode />}
          {activeMode === 'LEAVE' && <LeaveRequestMode />}
          
      </div>
    </div>
  );
}
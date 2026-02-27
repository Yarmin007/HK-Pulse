"use client";
import React from 'react';
import { Calendar } from 'lucide-react';

interface PageHeaderProps {
  title: string | React.ReactNode;
  subtitle?: string | React.ReactNode;
  date?: Date;
  onDateChange?: (date: Date) => void;
  actions?: React.ReactNode;
  children?: React.ReactNode; // Useful for putting Search Bars or Filter Pills under the title
}

export default function PageHeader({ title, subtitle, date, onDateChange, actions, children }: PageHeaderProps) {
  return (
    <div className="glass-header">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        
        {/* Title & Subtitle/Date */}
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[#6D2158] flex items-center gap-2">
            {title}
          </h1>
          
          {subtitle && !date && (
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
              {subtitle}
            </p>
          )}

          {date && (
            <div className="flex items-center gap-2 mt-2 bg-white px-3 py-1.5 rounded-lg shadow-sm border border-slate-200 w-fit relative cursor-pointer hover:border-[#6D2158] transition-colors">
              <Calendar size={14} className="text-[#6D2158]"/> 
              <span className="text-xs font-bold text-[#6D2158]">
                {date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              {onDateChange && (
                <input 
                  type="date" 
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                  value={date.toISOString().split('T')[0]} 
                  onChange={(e) => {
                    if (e.target.value) {
                      const newDate = new Date(e.target.value);
                      if (!isNaN(newDate.getTime())) onDateChange(newDate);
                    }
                  }}
                />
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        {actions && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 items-center w-full md:w-auto">
            {actions}
          </div>
        )}
      </div>

      {/* Optional Search / Filters below */}
      {children && (
        <div className="flex flex-col gap-2.5 mt-1">
          {children}
        </div>
      )}
    </div>
  );
}
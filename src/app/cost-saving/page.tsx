"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, Calendar, DollarSign, FileSpreadsheet, 
  Layers, Loader2, Save, ShoppingBag, Truck, HelpCircle, RefreshCw
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

type HostLevel = 'DA' | 'DB' | 'ATM';

type AttendanceRow = {
  host_id: string;
  date: string;
  status_code: string;
};

type HostRow = {
  host_id: string;
  host_level: HostLevel;
};

export default function CostSavingReportPage() {
  const [selectedMonth, setSelectedMonth] = useState('2026-05');
  const [isLoading, setIsLoading] = useState(false);

  // Level Salary Config Inputs (Base for Daily Rate Calculations)
  const [bandSalaries, setBandSalaries] = useState<Record<HostLevel, number>>({
    DA: 3000,
    DB: 1800,
    ATM: 950
  });

  // Database Automated Workings State
  const [weeklyWorkings, setWeeklyWorkings] = useState<Record<string, Record<HostLevel, number>>>({});

  // Operational & Vacant Manual Input State [month_cellKey]: number
  const [manualInputs, setManualInputs] = useState<Record<string, number>>({});

  const weeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];

  // Calculate Daily Rates for each level based on 30-day month formula
  const dailyRates = useMemo(() => {
    return {
      DA: bandSalaries.DA / 30,
      DB: bandSalaries.DB / 30,
      ATM: bandSalaries.ATM / 30
    };
  }, [bandSalaries]);

  useEffect(() => {
    fetchAttendanceWorkings();
    const storedSalaries = localStorage.getItem('hk_pulse_band_salaries');
    const storedManual = localStorage.getItem('hk_pulse_saving_manual');
    if (storedSalaries) setBandSalaries(JSON.parse(storedSalaries));
    if (storedManual) setManualInputs(JSON.parse(storedManual));
  }, [selectedMonth]);

  const handleSalaryChange = (level: HostLevel, val: string) => {
    const num = parseFloat(val) || 0;
    const updated = { ...bandSalaries, [level]: num };
    setBandSalaries(updated);
    localStorage.setItem('hk_pulse_band_salaries', JSON.stringify(updated));
  };

  const handleManualInputChange = (cellKey: string, val: string) => {
    const num = parseFloat(val) || 0;
    const updated = { ...manualInputs, [`${selectedMonth}_${cellKey}`]: num };
    setManualInputs(updated);
    localStorage.setItem('hk_pulse_saving_manual', JSON.stringify(updated));
  };

  const getManualValue = (cellKey: string): string => {
    const val = manualInputs[`${selectedMonth}_${cellKey}`];
    return val === undefined || val === 0 ? '' : String(val);
  };

  // --- AUTOMATED ATTENDANCE WEEKLY EXTRACTION ENGINE ---
  const fetchAttendanceWorkings = async () => {
    setIsLoading(true);
    try {
      const [hostRes, attRes] = await Promise.all([
        supabase.from('hsk_hosts').select('host_id, host_level').neq('status', 'Resigned'),
        supabase.from('hsk_attendance')
          .select('host_id, date, status_code')
          .gte('date', `${selectedMonth}-01`)
          .lte('date', `${selectedMonth}-31`)
      ]);

      const hostMap = new Map<string, HostLevel>();
      (hostRes.data || []).forEach((h: any) => {
        if (h.host_id && h.host_level) hostMap.set(h.host_id, h.host_level);
      });

      // Reset structures
      const matrix: Record<string, Record<HostLevel, number>> = {
        al_w1: { DA: 0, DB: 0, ATM: 0 }, al_w2: { DA: 0, DB: 0, ATM: 0 }, al_w3: { DA: 0, DB: 0, ATM: 0 }, al_w4: { DA: 0, DB: 0, ATM: 0 },
        off_w1: { DA: 0, DB: 0, ATM: 0 }, off_w2: { DA: 0, DB: 0, ATM: 0 }, off_w3: { DA: 0, DB: 0, ATM: 0 }, off_w4: { DA: 0, DB: 0, ATM: 0 },
        ph_w1: { DA: 0, DB: 0, ATM: 0 }, ph_w2: { DA: 0, DB: 0, ATM: 0 }, ph_w3: { DA: 0, DB: 0, ATM: 0 }, ph_w4: { DA: 0, DB: 0, ATM: 0 },
        np_w1: { DA: 0, DB: 0, ATM: 0 }, np_w2: { DA: 0, DB: 0, ATM: 0 }, np_w3: { DA: 0, DB: 0, ATM: 0 }, np_w4: { DA: 0, DB: 0, ATM: 0 },
      };

      (attRes.data || []).forEach((att: any) => {
        const level = hostMap.get(att.host_id);
        if (!level) return;

        const dayNum = parseInt(att.date.split('-')[2], 10);
        let weekKey = 1;
        if (dayNum >= 1 && dayNum <= 7) weekKey = 1;
        else if (dayNum >= 8 && dayNum <= 14) weekKey = 2;
        else if (dayNum >= 15 && dayNum <= 21) weekKey = 3;
        else weekKey = 4; // Week 4 incorporates days 22 to end of month

        const code = String(att.status_code).toUpperCase();

        if (['AL', 'VAC'].includes(code)) matrix[`al_w${weekKey}`][level]++;
        if (['O', 'OFF'].includes(code)) matrix[`off_w${weekKey}`][level]++;
        if (code === 'PH') matrix[`ph_w${weekKey}`][level]++;
        if (['NOP', 'LWP'].includes(code)) matrix[`np_w${weekKey}`][level]++;
      });

      setWeeklyWorkings(matrix);
    } catch (e) {
      console.error("Error drawing report workings:", e);
    }
    setIsLoading(false);
  };

  // --- AUTOMATIC VALUE LOOKUPS BY ROW ENGINE ---
  const getAutomatedRowWeeklyCost = (typeKey: 'al' | 'off' | 'ph' | 'np', weekIdx: number): number => {
    const weekKey = `${typeKey}_w${weekIdx + 1}`;
    const data = weeklyWorkings[weekKey];
    if (!data) return 0;

    // Multiply days by band specific daily rate
    const daCost = data.DA * dailyRates.DA;
    const dbCost = data.DB * dailyRates.DB;
    const atmCost = data.ATM * dailyRates.ATM;

    return daCost + dbCost + atmCost;
  };

  // --- SUMMATION OBJECTS FOR GRIDS ---
  const payrollSavings = useMemo(() => {
    const result: Record<string, number[]> = {
      vacant: [0, 1, 2, 3].map(w => parseFloat(getManualValue(`payroll_vacant_w${w+1}`)) || 0),
      al: [0, 1, 2, 3].map(w => getAutomatedRowWeeklyCost('al', w)),
      nopay: [0, 1, 2, 3].map(w => getAutomatedRowWeeklyCost('np', w)),
      ph: [0, 1, 2, 3].map(w => getAutomatedRowWeeklyCost('ph', w)),
      friday: [0, 1, 2, 3].map(w => parseFloat(getManualValue(`payroll_friday_w${w+1}`)) || 0),
      off: [0, 1, 2, 3].map(w => getAutomatedRowWeeklyCost('off', w)),
    };
    return result;
  }, [weeklyWorkings, manualInputs, dailyRates, selectedMonth]);

  const operationSavings = useMemo(() => {
    return {
      cleaning: [0, 1, 2, 3].map(w => parseFloat(getManualValue(`ops_cleaning_w${w+1}`)) || 0),
      guest: [0, 1, 2, 3].map(w => parseFloat(getManualValue(`ops_guest_w${w+1}`)) || 0),
      supplies: [0, 1, 2, 3].map(w => parseFloat(getManualValue(`ops_supplies_w${w+1}`)) || 0),
      travel: [0, 1, 2, 3].map(w => parseFloat(getManualValue(`ops_travel_w${w+1}`)) || 0),
    };
  }, [manualInputs, selectedMonth]);

  const columnTotals = useMemo(() => {
    const totals = [0, 0, 0, 0]; // Weeks 1-4
    for (let w = 0; w < 4; w++) {
      totals[w] += payrollSavings.vacant[w] + payrollSavings.al[w] + payrollSavings.nopay[w] + payrollSavings.ph[w] + payrollSavings.friday[w] + payrollSavings.off[w];
      totals[w] += operationSavings.cleaning[w] + operationSavings.guest[w] + operationSavings.supplies[w] + operationSavings.travel[w];
    }
    return totals;
  }, [payrollSavings, operationSavings]);

  const grandMonthlyTotal = columnTotals.reduce((a, b) => a + b, 0);

  return (
    <div className="absolute inset-0 md:left-64 pt-16 md:pt-0 flex flex-col bg-[#FDFBFD] font-sans text-slate-800 overflow-hidden">
      
      {/* HEADER SECTION */}
      <div className="flex-none flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-200 p-4 md:p-6 bg-white shadow-sm gap-4 z-10">
        <div>
          <h1 className="text-xl md:text-2xl font-black tracking-tight text-[#6D2158] flex items-center gap-2">
            <TrendingUp /> Cost Saving Report
          </h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
            Automatic Monthly Financial Performance Matrix
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <div className="flex items-center bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 shadow-inner gap-2">
            <Calendar size={14} className="text-slate-400" />
            <input 
              type="month" 
              className="bg-transparent text-xs font-black text-[#6D2158] outline-none cursor-pointer"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            />
          </div>
          <button onClick={fetchAttendanceWorkings} className="p-2 bg-slate-100 border rounded-xl hover:bg-slate-200 transition-colors" title="Sync Attendance Live">
            <RefreshCw size={14} className={isLoading ? "animate-spin text-[#6D2158]" : "text-slate-500"} />
          </button>
        </div>
      </div>

      {/* VIEWPORT SCROLL */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 custom-scrollbar">
        
        {/* TOP RATE MATRIX ROW CONFIGURATION */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4">
          {(['DA', 'DB', 'ATM'] as HostLevel[]).map(level => (
            <div key={level} className="flex items-center justify-between bg-slate-50/50 p-3 rounded-xl border border-slate-100">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{level} Avg Salary Base</span>
                <p className="text-xs text-slate-500 font-bold mt-0.5">Daily: ${dailyRates[level].toFixed(2)}</p>
              </div>
              <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 shadow-sm w-28">
                <span className="text-xs font-bold text-slate-400 mr-1">$</span>
                <input 
                  type="number"
                  placeholder="0"
                  className="w-full text-right p-1.5 text-xs font-black text-[#6D2158] outline-none bg-transparent"
                  value={bandSalaries[level]}
                  onChange={(e) => handleSalaryChange(level, e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>

        {/* FINANCIAL SUMMARY HIGHLIGHT GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Payroll Cleared Value</span>
            <p className="text-xl font-black text-purple-700 mt-1">
              ${([payrollSavings.vacant, payrollSavings.al, payrollSavings.nopay, payrollSavings.ph, payrollSavings.friday, payrollSavings.off].reduce((acc, row) => acc + row.reduce((a,b)=>a+b, 0), 0)).toFixed(2)}
            </p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Operations Saved Value</span>
            <p className="text-xl font-black text-indigo-600 mt-1">
              ${([operationSavings.cleaning, operationSavings.guest, operationSavings.supplies, operationSavings.travel].reduce((acc, row) => acc + row.reduce((a,b)=>a+b, 0), 0)).toFixed(2)}
            </p>
          </div>
          <div className="bg-[#6D2158]/5 border-2 border-[#6D2158]/20 p-4 rounded-xl shadow-sm">
            <span className="text-[9px] font-black uppercase tracking-widest text-[#6D2158]">Grand Total Monthly Savings</span>
            <p className="text-2xl font-black text-[#6D2158] mt-0.5">${grandMonthlyTotal.toFixed(2)}</p>
          </div>
        </div>

        {/* PRIMARY SHEET REPORT LEDGER */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                  <th className="p-3.5 font-black text-slate-700 text-xs w-[280px]">Operational Stream Components</th>
                  {weeks.map((w, i) => (
                    <th key={i} className="p-3.5 text-center border-l border-slate-100 w-[115px] font-black uppercase tracking-wider text-[10px]">{w}</th>
                  ))}
                  <th className="p-3.5 text-right border-l-2 border-slate-200 bg-purple-50/40 font-black text-[#6D2158] w-[150px]">Month Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                
                {/* CATEGORY 1: PAYROLL RELATED SAVINGS */}
                <tr className="bg-slate-100/60 text-[10px] font-black uppercase tracking-wider text-[#6D2158]">
                  <td colSpan={6} className="p-2.5 pl-3">1. Payroll Related Savings</td>
                </tr>

                {/* VACANT POSITIONS */}
                <tr className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-3 font-bold pl-5 flex items-center gap-2"><Layers size={14} className="text-slate-400"/> Saving from Vacant Positions</td>
                  {weeks.map((_, w) => (
                    <td key={w} className="p-1 border-l border-slate-100">
                      <input 
                        type="number" placeholder="0.00" value={getManualValue(`payroll_vacant_w${w+1}`)}
                        onChange={(e) => handleManualInputChange(`payroll_vacant_w${w+1}`, e.target.value)}
                        className="w-full h-8 text-center bg-transparent border border-transparent hover:border-slate-200 focus:border-[#6D2158] focus:bg-white rounded-lg outline-none font-bold font-mono"
                      />
                    </td>
                  ))}
                  <td className="p-3 text-right border-l-2 border-slate-200 bg-slate-50/40 font-black font-mono">${payrollSavings.vacant.reduce((a,b)=>a+b, 0).toFixed(2)}</td>
                </tr>

                {/* AL CLEARANCE */}
                <tr className="hover:bg-slate-50/50 transition-colors bg-purple-50/10">
                  <td className="p-3 font-bold pl-5 flex items-center gap-2"><FileSpreadsheet size={14} className="text-purple-400"/> Annual Leave Clearance (AL)</td>
                  {weeks.map((_, w) => (
                    <td key={w} className="p-3 text-center border-l border-slate-100 font-bold font-mono text-purple-700">
                      {payrollSavings.al[w] > 0 ? `$${payrollSavings.al[w].toFixed(2)}` : '-'}
                    </td>
                  ))}
                  <td className="p-3 text-right border-l-2 border-slate-200 bg-purple-50/40 font-black font-mono text-purple-900">${payrollSavings.al.reduce((a,b)=>a+b, 0).toFixed(2)}</td>
                </tr>

                {/* NO PAY LEAVE */}
                <tr className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-3 font-bold pl-5 flex items-center gap-2"><DollarSign size={14} className="text-slate-400"/> No Pay Leave (LWP)</td>
                  {weeks.map((_, w) => (
                    <td key={w} className="p-3 text-center border-l border-slate-100 font-bold font-mono text-slate-600">
                      {payrollSavings.nopay[w] > 0 ? `$${payrollSavings.nopay[w].toFixed(2)}` : '-'}
                    </td>
                  ))}
                  <td className="p-3 text-right border-l-2 border-slate-200 bg-slate-50/40 font-black font-mono">${payrollSavings.nopay.reduce((a,b)=>a+b, 0).toFixed(2)}</td>
                </tr>

                {/* PH CLEARANCE */}
                <tr className="hover:bg-slate-50/50 transition-colors bg-purple-50/10">
                  <td className="p-3 font-bold pl-5 flex items-center gap-2"><FileSpreadsheet size={14} className="text-purple-400"/> Public Holiday Clearance (PH)</td>
                  {weeks.map((_, w) => (
                    <td key={w} className="p-3 text-center border-l border-slate-100 font-bold font-mono text-purple-700">
                      {payrollSavings.ph[w] > 0 ? `$${payrollSavings.ph[w].toFixed(2)}` : '-'}
                    </td>
                  ))}
                  <td className="p-3 text-right border-l-2 border-slate-200 bg-purple-50/40 font-black font-mono text-purple-900">${payrollSavings.ph.reduce((a,b)=>a+b, 0).toFixed(2)}</td>
                </tr>

                {/* FRIDAY PAY */}
                <tr className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-3 font-bold pl-5 flex items-center gap-2"><Layers size={14} className="text-slate-400"/> Friday Pay Clearances</td>
                  {weeks.map((_, w) => (
                    <td key={w} className="p-1 border-l border-slate-100">
                      <input 
                        type="number" placeholder="0.00" value={getManualValue(`payroll_friday_w${w+1}`)}
                        onChange={(e) => handleManualInputChange(`payroll_friday_w${w+1}`, e.target.value)}
                        className="w-full h-8 text-center bg-transparent border border-transparent hover:border-slate-200 focus:border-[#6D2158] focus:bg-white rounded-lg outline-none font-bold font-mono"
                      />
                    </td>
                  ))}
                  <td className="p-3 text-right border-l-2 border-slate-200 bg-slate-50/40 font-black font-mono">${payrollSavings.friday.reduce((a,b)=>a+b, 0).toFixed(2)}</td>
                </tr>

                {/* OFF DAY */}
                <tr className="hover:bg-slate-50/50 transition-colors bg-purple-50/10">
                  <td className="p-3 font-bold pl-5 flex items-center gap-2"><FileSpreadsheet size={14} className="text-purple-400"/> Weekly Off Days Cleared</td>
                  {weeks.map((_, w) => (
                    <td key={w} className="p-3 text-center border-l border-slate-100 font-bold font-mono text-purple-700">
                      {payrollSavings.off[w] > 0 ? `$${payrollSavings.off[w].toFixed(2)}` : '-'}
                    </td>
                  ))}
                  <td className="p-3 text-right border-l-2 border-slate-200 bg-purple-50/40 font-black font-mono text-purple-900">${payrollSavings.off.reduce((a,b)=>a+b, 0).toFixed(2)}</td>
                </tr>


                {/* CATEGORY 2: OPERATIONS RELATED SAVINGS */}
                <tr className="bg-slate-100/60 text-[10px] font-black uppercase tracking-wider text-indigo-700 border-t-2 border-slate-200">
                  <td colSpan={6} className="p-2.5 pl-3">2. Operations Related Savings</td>
                </tr>

                {/* CLEANING SUPPLIES */}
                <tr className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-3 font-bold pl-5 flex items-center gap-2"><ShoppingBag size={14} className="text-slate-400"/> Cleaning Supplies Logistics</td>
                  {weeks.map((_, w) => (
                    <td key={w} className="p-1 border-l border-slate-100">
                      <input 
                        type="number" placeholder="0.00" value={getManualValue(`ops_cleaning_w${w+1}`)}
                        onChange={(e) => handleManualInputChange(`ops_cleaning_w${w+1}`, e.target.value)}
                        className="w-full h-8 text-center bg-transparent border border-transparent hover:border-slate-200 focus:border-[#6D2158] focus:bg-white rounded-lg outline-none font-bold font-mono"
                      />
                    </td>
                  ))}
                  <td className="p-3 text-right border-l-2 border-slate-200 bg-slate-50/40 font-black font-mono">${operationSavings.cleaning.reduce((a,b)=>a+b, 0).toFixed(2)}</td>
                </tr>

                {/* GUEST SUPPLIES */}
                <tr className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-3 font-bold pl-5 flex items-center gap-2"><ShoppingBag size={14} className="text-slate-400"/> Guest Amenities & Supplies</td>
                  {weeks.map((_, w) => (
                    <td key={w} className="p-1 border-l border-slate-100">
                      <input 
                        type="number" placeholder="0.00" value={getManualValue(`ops_guest_w${w+1}`)}
                        onChange={(e) => handleManualInputChange(`ops_guest_w${w+1}`, e.target.value)}
                        className="w-full h-8 text-center bg-transparent border border-transparent hover:border-slate-200 focus:border-[#6D2158] focus:bg-white rounded-lg outline-none font-bold font-mono"
                      />
                    </td>
                  ))}
                  <td className="p-3 text-right border-l-2 border-slate-200 bg-slate-50/40 font-black font-mono">${operationSavings.guest.reduce((a,b)=>a+b, 0).toFixed(2)}</td>
                </tr>

                {/* OPERATION SUPPLIES */}
                <tr className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-3 font-bold pl-5 flex items-center gap-2"><ShoppingBag size={14} className="text-slate-400"/> General Operational Supplies</td>
                  {weeks.map((_, w) => (
                    <td key={w} className="p-1 border-l border-slate-100">
                      <input 
                        type="number" placeholder="0.00" value={getManualValue(`ops_supplies_w${w+1}`)}
                        onChange={(e) => handleManualInputChange(`ops_supplies_w${w+1}`, e.target.value)}
                        className="w-full h-8 text-center bg-transparent border border-transparent hover:border-slate-200 focus:border-[#6D2158] focus:bg-white rounded-lg outline-none font-bold font-mono"
                      />
                    </td>
                  ))}
                  <td className="p-3 text-right border-l-2 border-slate-200 bg-slate-50/40 font-black font-mono">${operationSavings.supplies.reduce((a,b)=>a+b, 0).toFixed(2)}</td>
                </tr>

                {/* TRAVEL - OTHER */}
                <tr className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-3 font-bold pl-5 flex items-center gap-2"><Truck size={14} className="text-slate-400"/> Travel & Commute Expenses (Other)</td>
                  {weeks.map((_, w) => (
                    <td key={w} className="p-1 border-l border-slate-100">
                      <input 
                        type="number" placeholder="0.00" value={getManualValue(`ops_travel_w${w+1}`)}
                        onChange={(e) => handleManualInputChange(`ops_travel_w${w+1}`, e.target.value)}
                        className="w-full h-8 text-center bg-transparent border border-transparent hover:border-slate-200 focus:border-[#6D2158] focus:bg-white rounded-lg outline-none font-bold font-mono"
                      />
                    </td>
                  ))}
                  <td className="p-3 text-right border-l-2 border-slate-200 bg-slate-50/40 font-black font-mono">${operationSavings.travel.reduce((a,b)=>a+b, 0).toFixed(2)}</td>
                </tr>

                {/* GRAND SUMMARY TOTAL ROW */}
                <tr className="bg-[#6D2158]/5 border-t-2 border-slate-300 font-black text-xs text-slate-800">
                  <td className="p-4 uppercase tracking-wider text-[#6D2158]">Grand Total Overview</td>
                  {columnTotals.map((tot, i) => (
                    <td key={i} className="p-4 text-center border-l border-slate-100 font-mono text-[#6D2158] bg-[#6D2158]/5">${tot.toFixed(2)}</td>
                  ))}
                  <td className="p-4 text-right border-l-2 border-slate-200 text-[#6D2158] bg-[#6D2158]/10 text-sm font-mono">${grandMonthlyTotal.toFixed(2)}</td>
                </tr>

              </tbody>
            </table>
          </div>
        </div>

        {/* BACKGROUND SUB-WORKINGS GRID (ROSTER LEAVE TRACKING PER LEVEL) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-700 flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
            <HelpCircle size={16} className="text-[#6D2158]"/> Attendance Roster Workings Matrix (Days Cleared)
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {['al', 'off', 'ph', 'np'].map(type => {
              const labelMap: Record<string, string> = { al: 'Annual Leave (AL)', off: 'Off Days (O)', ph: 'Public Holiday (PH)', np: 'No Pay Leave (NOP)' };
              return (
                <div key={type} className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col">
                  <h4 className="text-[11px] font-black uppercase text-[#6D2158] tracking-wide mb-2 border-b pb-1.5">{labelMap[type]}</h4>
                  <div className="space-y-1.5 flex-1 text-[11px]">
                    {weeks.map((_, wIdx) => {
                      const key = `${type}_w${wIdx + 1}`;
                      const data = weeklyWorkings[key] || { DA: 0, DB: 0, ATM: 0 };
                      return (
                        <div key={wIdx} className="flex justify-between items-center text-slate-600 bg-white px-2 py-1 rounded border border-slate-100 font-mono">
                          <span className="font-sans font-bold text-slate-400">W{wIdx + 1}</span>
                          <span className="space-x-2">
                            <span>DA:<b>{data.DA}</b></span>
                            <span>DB:<b>{data.DB}</b></span>
                            <span>ATM:<b>{data.ATM}</b></span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
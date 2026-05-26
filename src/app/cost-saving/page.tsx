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
  const [activeTab, setActiveTab] = useState<'REPORT' | 'WORKINGS'>('REPORT');

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

  // Structured Vacant Positions, Prosecco and Steam Price States
  const [vacantPositions, setVacantPositions] = useState<{ id: string; name: string; qty: number; basicPay: number; weeks: number[] }[]>([]);
  const [formWeeks, setFormWeeks] = useState<number[]>([1, 2, 3, 4]);
  const [proseccoPrice, setProseccoPrice] = useState<number>(11.5);
  const [steamLiterPrice, setSteamLiterPrice] = useState<number>(1.2);

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
    fetchMonthlyDatabaseData();
    fetchAttendanceWorkings();
  }, [selectedMonth]);

  // --- FETCH CONFIGS AND INPUTS FROM SUPABASE CLOUD ROW ---
  const fetchMonthlyDatabaseData = async () => {
    try {
      const { data, error } = await supabase
        .from('hsk_cost_saving_reports')
        .select('*')
        .eq('month', selectedMonth)
        .single();

      if (data) {
        if (data.band_salaries) setBandSalaries(data.band_salaries);
        if (data.prosecco_price) setProseccoPrice(parseFloat(data.prosecco_price));
        if (data.steam_liter_price) setSteamLiterPrice(parseFloat(data.steam_liter_price));
        if (data.vacant_positions) setVacantPositions(data.vacant_positions);
        if (data.manual_inputs) setManualInputs(data.manual_inputs);
      } else {
        // Fallback to initial defaults if no record exists yet for this target month
        setBandSalaries({ DA: 3000, DB: 1800, ATM: 950 });
        setProseccoPrice(11.5);
        setSteamLiterPrice(1.2);
        setVacantPositions([]);
        setManualInputs({});
      }
    } catch (err) {
      console.log("No cloud report row matches this month yet, presenting initial default layouts.");
    }
  };

  // --- SAVE ALL CURRENT MODIFIED CONFIGS AND INPUT VALUES TO DATABASE ---
  const saveReportToDatabase = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('hsk_cost_saving_reports')
        .upsert({
          month: selectedMonth,
          band_salaries: bandSalaries,
          prosecco_price: proseccoPrice,
          steam_liter_price: steamLiterPrice,
          vacant_positions: vacantPositions,
          manual_inputs: manualInputs,
          updated_at: new Date().toISOString()
        }, { onConflict: 'month' });

      if (error) throw error;
      toast.success("Cost-Saving report successfully saved and synced to database!");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to sync to cloud: " + err.message);
    }
    setIsLoading(false);
  };

  const handleSalaryChange = (level: HostLevel, val: string) => {
    const num = parseFloat(val) || 0;
    const updated = { ...bandSalaries, [level]: num };
    setBandSalaries(updated);
  };

  const handleManualInputChange = (cellKey: string, val: string) => {
    const num = parseFloat(val) || 0;
    const updated = { ...manualInputs, [`${selectedMonth}_${cellKey}`]: num };
    setManualInputs(updated);
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
        friday_w1: { DA: 0, DB: 0, ATM: 0 }, friday_w2: { DA: 0, DB: 0, ATM: 0 }, friday_w3: { DA: 0, DB: 0, ATM: 0 }, friday_w4: { DA: 0, DB: 0, ATM: 0 },
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

        // Friday Pay Clearance Checking (DB & ATM only lose Friday pay if not present)
        const dateObj = new Date(att.date + 'T00:00:00');
        if (dateObj.getDay() === 5 && ['AL', 'VAC', 'O', 'OFF', 'PH', 'NOP', 'LWP'].includes(code)) {
          matrix[`friday_w${weekKey}`][level]++;
        }
      });

      setWeeklyWorkings(matrix);
    } catch (e) {
      console.error("Error drawing report workings:", e);
    }
    setIsLoading(false);
  };

  // --- AUTOMATIC VALUE LOOKUPS BY ROW ENGINE ---
  const getAutomatedRowWeeklyCost = (typeKey: 'al' | 'off' | 'ph' | 'np' | 'friday', weekIdx: number): number => {
    const weekKey = `${typeKey}_w${weekIdx + 1}`;
    const data = weeklyWorkings[weekKey];
    if (!data) return 0;

    // Multiply days by band specific daily rate
    let daCost = data.DA * dailyRates.DA;
    let dbCost = data.DB * dailyRates.DB;
    let atmCost = data.ATM * dailyRates.ATM;

    if (typeKey === 'friday') {
      daCost = 0; // DA is excluded completely as requested
      dbCost = data.DB * dailyRates.DB * 1.5;
      atmCost = data.ATM * dailyRates.ATM * 1.5;
    }

    return daCost + dbCost + atmCost;
  };

  // --- SUMMATION OBJECTS FOR GRIDS ---
  const payrollSavings = useMemo(() => {
    const result: Record<string, number[]> = {
      vacant: [0, 1, 2, 3].map(w => {
        const manual = parseFloat(getManualValue(`payroll_vacant_w${w+1}`)) || 0;
        const autoVacant = vacantPositions.reduce((sum, pos) => {
          if (pos.weeks.includes(w + 1)) {
            return sum + (pos.qty * pos.basicPay) / 4;
          }
          return sum;
        }, 0);
        return manual + autoVacant;
      }),
      al: [0, 1, 2, 3].map(w => getAutomatedRowWeeklyCost('al', w)),
      nopay: [0, 1, 2, 3].map(w => getAutomatedRowWeeklyCost('np', w)),
      ph: [0, 1, 2, 3].map(w => getAutomatedRowWeeklyCost('ph', w)),
      friday: [0, 1, 2, 3].map(w => {
        const manual = parseFloat(getManualValue(`payroll_friday_w${w+1}`)) || 0;
        const autoFriday = getAutomatedRowWeeklyCost('friday', w);
        return manual + autoFriday;
      }),
      off: [0, 1, 2, 3].map(w => getAutomatedRowWeeklyCost('off', w)),
    };
    return result;
  }, [weeklyWorkings, manualInputs, dailyRates, selectedMonth, vacantPositions]);

  const operationSavings = useMemo(() => {
    return {
      cleaning: [0, 1, 2, 3].map(w => parseFloat(getManualValue(`ops_cleaning_w${w+1}`)) || 0),
      guest: [0, 1, 2, 3].map(w => parseFloat(getManualValue(`ops_guest_w${w+1}`)) || 0),
      supplies: [0, 1, 2, 3].map(w => parseFloat(getManualValue(`ops_supplies_w${w+1}`)) || 0),
      travel: [0, 1, 2, 3].map(w => parseFloat(getManualValue(`ops_travel_w${w+1}`)) || 0),
      prosecco: [0, 1, 2, 3].map(w => {
        const qty = parseFloat(getManualValue(`ops_prosecco_qty_w${w+1}`)) || 0;
        return qty * proseccoPrice;
      }),
      steam: [0, 1, 2, 3].map(w => {
        const hrs = parseFloat(getManualValue(`ops_steam_hrs_w${w+1}`)) || 0;
        return hrs * 20 * steamLiterPrice;
      }),
    };
  }, [manualInputs, selectedMonth, proseccoPrice, steamLiterPrice]);

  const columnTotals = useMemo(() => {
    const totals = [0, 0, 0, 0]; // Weeks 1-4
    for (let w = 0; w < 4; w++) {
      totals[w] += payrollSavings.vacant[w] + payrollSavings.al[w] + payrollSavings.nopay[w] + payrollSavings.ph[w] + payrollSavings.friday[w] + payrollSavings.off[w];
      totals[w] += operationSavings.cleaning[w] + operationSavings.guest[w] + operationSavings.supplies[w] + operationSavings.travel[w] + operationSavings.prosecco[w] + operationSavings.steam[w];
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
          
          {/* DATABASE SAVE REPORT ACTION BUTTON */}
          <button onClick={saveReportToDatabase} disabled={isLoading} className="p-2 bg-[#6D2158] hover:bg-[#581a47] text-white rounded-xl transition-all flex items-center gap-1.5 text-xs font-black uppercase px-3 shadow-md border border-[#6D2158]/10 active:scale-95 disabled:opacity-50">
            {isLoading ? <Loader2 className="animate-spin" size={14}/> : <Save size={14} />} Save Report
          </button>

          <button onClick={fetchAttendanceWorkings} className="p-2 bg-slate-100 border rounded-xl hover:bg-slate-200 transition-colors" title="Sync Attendance Live">
            <RefreshCw size={14} className={isLoading ? "animate-spin text-[#6D2158]" : "text-slate-500"} />
          </button>
        </div>
      </div>

      {/* VIEWPORT SCROLL */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 custom-scrollbar">
        
        {/* TOP RATE MATRIX ROW CONFIGURATION */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
          {(['DA', 'DB', 'ATM'] as HostLevel[]).map(level => (
            <div key={level} className="flex items-center justify-between bg-slate-50/50 p-3 rounded-xl border border-slate-100">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{level} Avg Salary Base</span>
                <p className="text-xs text-slate-500 font-bold mt-0.5">Daily: ${dailyRates[level].toFixed(2)}</p>
              </div>
              <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 shadow-sm w-24">
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

          {/* PROSECCO PRICE CONFIG */}
          <div className="flex items-center justify-between bg-slate-50/50 p-3 rounded-xl border border-slate-100">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Prosecco Bottle Cost</span>
              <p className="text-xs text-slate-500 font-bold mt-0.5">Default: $11.50</p>
            </div>
            <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 shadow-sm w-24">
              <span className="text-xs font-bold text-slate-400 mr-1">$</span>
              <input 
                type="number"
                step="0.01"
                className="w-full text-right p-1.5 text-xs font-black text-[#6D2158] outline-none bg-transparent"
                value={proseccoPrice}
                onChange={(e) => {
                  const num = parseFloat(e.target.value) || 0;
                  setProseccoPrice(num);
                }}
              />
            </div>
          </div>

          {/* STEAM FUEL PRICE CONFIG */}
          <div className="flex items-center justify-between bg-slate-50/50 p-3 rounded-xl border border-slate-100">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Steam Fuel Price / Ltr</span>
              <p className="text-xs text-slate-500 font-bold mt-0.5">1 Hr = 20 Ltrs</p>
            </div>
            <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 shadow-sm w-24">
              <span className="text-xs font-bold text-slate-400 mr-1">$</span>
              <input 
                type="number"
                step="0.01"
                className="w-full text-right p-1.5 text-xs font-black text-[#6D2158] outline-none bg-transparent"
                value={steamLiterPrice}
                onChange={(e) => {
                  const num = parseFloat(e.target.value) || 0;
                  setSteamLiterPrice(num);
                }}
              />
            </div>
          </div>
        </div>

        {/* VACANT POSITIONS MANAGER PANEL */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-2">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-700 flex items-center gap-2">
              <Layers size={16} className="text-[#6D2158]"/> Vacant Positions Configuration Structure
            </h3>
            <span className="text-[10px] font-bold text-slate-400 uppercase">Target Weeks Selection</span>
          </div>
          
          <form onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const name = (form.elements.namedItem('posName') as HTMLInputElement).value;
            const qty = parseInt((form.elements.namedItem('posQty') as HTMLInputElement).value) || 0;
            const basicPay = parseFloat((form.elements.namedItem('posPay') as HTMLInputElement).value) || 0;
            
            if (!name || qty <= 0 || basicPay <= 0) {
              toast.error("Please fill in all vacant position fields correctly.");
              return;
            }

            if (formWeeks.length === 0) {
              toast.error("Please select at least one week for vacancy.");
              return;
            }
            
            const newPos = { id: 'vac_' + Date.now(), name, qty, basicPay, weeks: formWeeks };
            const updated = [...vacantPositions, newPos];
            setVacantPositions(updated);
            form.reset();
            setFormWeeks([1, 2, 3, 4]);
            toast.success("Vacant position added locally. Save report to persist cloud-wide!");
          }} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Position Name</label>
                <input name="posName" type="text" placeholder="e.g. Villa Attendant" className="w-full p-2 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#6D2158]" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Quantity (Qty)</label>
                <input name="posQty" type="number" min="1" placeholder="1" className="w-full p-2 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#6D2158]" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Basic Pay ($)</label>
                <input name="posPay" type="number" min="0" step="0.01" placeholder="1000" className="w-full p-2 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#6D2158]" />
              </div>
              <button type="submit" className="w-full bg-[#6D2158] hover:bg-[#561a46] text-white py-2 px-4 rounded-lg text-xs font-black uppercase tracking-wider h-9 transition-colors">
                Add Position
              </button>
            </div>

            <div className="flex items-center gap-4 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Select Weeks Vacant:</span>
              {[1, 2, 3, 4].map(w => (
                <label key={w} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={formWeeks.includes(w)} 
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormWeeks([...formWeeks, w]);
                      } else {
                        setFormWeeks(formWeeks.filter(item => item !== w));
                      }
                    }}
                    className="rounded border-slate-300 text-[#6D2158] focus:ring-[#6D2158] h-3.5 w-3.5"
                  />
                  Week {w}
                </label>
              ))}
            </div>
          </form>

          {vacantPositions.length > 0 && (
            <div className="border border-slate-100 rounded-xl overflow-hidden text-xs">
              <div className="bg-slate-50 p-2 grid grid-cols-4 font-bold text-slate-500 border-b border-slate-100 uppercase tracking-wider text-[9px]">
                <span>Position Details</span>
                <span className="text-center">Qty</span>
                <span className="text-center">Basic Pay (Month)</span>
                <span className="text-right pr-2">Action</span>
              </div>
              <div className="divide-y divide-slate-50 max-h-32 overflow-y-auto custom-scrollbar">
                {vacantPositions.map(pos => (
                  <div key={pos.id} className="p-2 grid grid-cols-4 items-center text-slate-700 font-bold">
                    <div className="flex flex-col">
                      <span>{pos.name}</span>
                      <span className="text-[9px] text-purple-600">Active: {pos.weeks.map(w => `W${w}`).join(', ')}</span>
                    </div>
                    <span className="text-center font-mono">{pos.qty}</span>
                    <span className="text-center font-mono">${pos.basicPay.toFixed(2)}</span>
                    <div className="text-right pr-2">
                      <button type="button" onClick={() => {
                        const updated = vacantPositions.filter(p => p.id !== pos.id);
                        setVacantPositions(updated);
                        toast.success("Position removed. Remember to click save report!");
                      }} className="text-rose-600 hover:text-rose-800 font-black text-[10px] uppercase tracking-wider">
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* CONTROLS SUB-TAB SELECTION PANELS */}
        <div className="flex border-b border-slate-200 gap-2 shrink-0">
          <button 
            onClick={() => setActiveTab('REPORT')}
            className={`pb-2.5 px-4 font-black text-xs uppercase tracking-widest transition-all border-b-2 ${activeTab === 'REPORT' ? 'border-[#6D2158] text-[#6D2158]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
          >
            Report Matrix
          </button>
          <button 
            onClick={() => setActiveTab('WORKINGS')}
            className={`pb-2.5 px-4 font-black text-xs uppercase tracking-widest transition-all border-b-2 ${activeTab === 'WORKINGS' ? 'border-[#6D2158] text-[#6D2158]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
          >
            Workings & Calculations
          </button>
        </div>

        {/* TAB CONTAINER 1: STANDARD SAVINGS LEDGER REPORT */}
        {activeTab === 'REPORT' && (
          <>
            {/* FINANCIAL SUMMARY HIGHLIGHT GRID */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Payroll Cleared Value</span>
                <p className="text-xl font-black text-purple-700 mt-1">
                  ${([payrollSavings.vacant, payrollSavings.al, payrollSavings.nopay, payrollSavings.ph, payrollSavings.friday, payrollSavings.off].reduce((acc, row) => acc + row.reduce((a,b)=>acc+b, 0), 0)).toFixed(2)}
                </p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Operations Saved Value</span>
                <p className="text-xl font-black text-indigo-600 mt-1">
                  ${([operationSavings.cleaning, operationSavings.guest, operationSavings.supplies, operationSavings.travel, operationSavings.prosecco, operationSavings.steam].reduce((acc, row) => acc + row.reduce((a,b)=>a+b, 0), 0)).toFixed(2)}
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
                      <td className="p-3 font-bold pl-5 flex items-center gap-2">
                        <Layers size={14} className="text-slate-400"/> Saving from Vacant Positions
                      </td>
                      {weeks.map((_, w) => (
                        <td key={w} className="p-1 border-l border-slate-100 text-center font-mono font-bold">
                          <div className="flex flex-col items-center justify-center space-y-0.5">
                            {vacantPositions.filter(p => p.weeks.includes(w + 1)).length > 0 && (
                              <span className="text-[10px] text-purple-700 font-black">
                                ${(vacantPositions.reduce((sum, p) => p.weeks.includes(w + 1) ? sum + (p.qty * p.basicPay) / 4 : sum, 0)).toFixed(2)}
                              </span>
                            )}
                            <input 
                              type="number" placeholder="+ Manual Adj" value={getManualValue(`payroll_vacant_w${w+1}`)}
                              onChange={(e) => handleManualInputChange(`payroll_vacant_w${w+1}`, e.target.value)}
                              className="w-20 h-6 text-center bg-transparent border border-transparent hover:border-slate-200 focus:border-[#6D2158] focus:bg-white rounded outline-none font-bold font-mono text-[11px]"
                            />
                          </div>
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

                    {/* FRIDAY PAY Clearances */}
                    <tr className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-3 font-bold pl-5 flex items-center gap-2">
                        <Layers size={14} className="text-slate-400"/> Friday Pay Clearances
                      </td>
                      {weeks.map((_, w) => (
                        <td key={w} className="p-1 border-l border-slate-100 text-center font-mono font-bold">
                          <div className="flex flex-col items-center justify-center space-y-0.5">
                            {getAutomatedRowWeeklyCost('friday', w) > 0 && (
                              <span className="text-[10px] text-[#6D2158] font-black">
                                ${getAutomatedRowWeeklyCost('friday', w).toFixed(2)}
                              </span>
                            )}
                            <input 
                              type="number" placeholder="+ Manual Adj" value={getManualValue(`payroll_friday_w${w+1}`)}
                              onChange={(e) => handleManualInputChange(`payroll_friday_w${w+1}`, e.target.value)}
                              className="w-full h-6 text-center bg-transparent border border-transparent hover:border-slate-200 focus:border-[#6D2158] focus:bg-white roundedoutline-none font-bold font-mono text-[11px]"
                            />
                          </div>
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

                    {/* UNUSED PROSECCO BOTTLES */}
                    <tr className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-3 font-bold pl-5 flex items-center gap-2"><ShoppingBag size={14} className="text-[#6D2158]"/> Unused Prosecco Bottles (Arrivals)</td>
                      {weeks.map((_, w) => (
                        <td key={w} className="p-3 border-l border-slate-100 text-center font-mono font-bold text-[#6D2158]">
                          {operationSavings.prosecco[w] > 0 ? `$${operationSavings.prosecco[w].toFixed(2)}` : '-'}
                          {parseFloat(getManualValue(`ops_prosecco_qty_w${w+1}`)) > 0 && (
                            <span className="text-[9px] text-slate-400 block font-sans">
                              ({getManualValue(`ops_prosecco_qty_w${w+1}`)} btls)
                            </span>
                          )}
                        </td>
                      ))}
                      <td className="p-3 text-right border-l-2 border-slate-200 bg-slate-50/40 font-black font-mono text-[#6D2158]">${operationSavings.prosecco.reduce((a,b)=>a+b, 0).toFixed(2)}</td>
                    </tr>

                    {/* SAVED STEAM HOURS FROM LAUNDRY */}
                    <tr className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-3 font-bold pl-5 flex items-center gap-2"><RefreshCw size={14} className="text-slate-400"/> Saved Steam Hrs from Laundry</td>
                      {weeks.map((_, w) => (
                        <td key={w} className="p-3 text-center border-l border-slate-100 font-mono font-bold text-[#6D2158]">
                          {operationSavings.steam[w] > 0 ? `$${operationSavings.steam[w].toFixed(2)}` : '-'}
                          {parseFloat(getManualValue(`ops_steam_hrs_w${w+1}`)) > 0 && (
                            <span className="text-[9px] text-slate-400 block font-sans">
                              ({getManualValue(`ops_steam_hrs_w${w+1}`)} hrs)
                            </span>
                          )}
                        </td>
                      ))}
                      <td className="p-3 text-right border-l-2 border-slate-200 bg-slate-50/40 font-black font-mono text-[#6D2158]">${operationSavings.steam.reduce((a,b)=>a+b, 0).toFixed(2)}</td>
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
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {['al', 'off', 'ph', 'np', 'friday'].map(type => {
                  const labelMap: Record<string, string> = { al: 'Annual Leave (AL)', off: 'Off Days (O)', ph: 'Public Holiday (PH)', np: 'No Pay Leave (NOP)', friday: 'Friday Leaves (DB/ATM)' };
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
          </>
        )}

        {/* TAB CONTAINER 2: TRANSPARENT MATHEMATICAL WORKS AND MULTIPLIER TRACES */}
        {activeTab === 'WORKINGS' && (
          <div className="space-y-6 animate-in fade-in-50 duration-200">
            
            {/* LIVE DAILY RATE CALCULATION FORMULAS */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-700 flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
                <DollarSign size={16} className="text-[#6D2158]"/> 1. Live Daily Rate Formula Rules (Salary Base / 30 Days)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="p-3 bg-purple-50/50 border border-purple-100 rounded-xl">
                  <span className="font-black text-purple-950 block uppercase tracking-wider mb-1">Manager / DA Level</span>
                  <p className="font-mono text-slate-500">Formula: ${bandSalaries.DA} / 30 days</p>
                  <p className="font-mono text-sm font-black text-purple-700 mt-1">Daily Rate = ${dailyRates.DA.toFixed(4)}</p>
                </div>
                <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl">
                  <span className="font-black text-indigo-950 block uppercase tracking-wider mb-1">Supervisors / DB Level</span>
                  <p className="font-mono text-slate-500">Formula: ${bandSalaries.DB} / 30 days</p>
                  <p className="font-mono text-sm font-black text-indigo-700 mt-1">Daily Rate = ${dailyRates.DB.toFixed(4)}</p>
                </div>
                <div className="p-3 bg-pink-50/50 border border-pink-100 rounded-xl">
                  <span className="font-black text-pink-950 block uppercase tracking-wider mb-1">Attendants / ATM Level</span>
                  <p className="font-mono text-slate-500">Formula: ${bandSalaries.ATM} / 30 days</p>
                  <p className="font-mono text-sm font-black text-pink-700 mt-1">Daily Rate = ${dailyRates.ATM.toFixed(4)}</p>
                </div>
              </div>
            </div>

            {/* DETAILED CATEGORY TRACE SCHEDULERS */}
            {['al', 'off', 'ph', 'np', 'friday', 'prosecco', 'steam'].map(type => {
              const labelMap: Record<string, string> = { 
                al: 'Annual Leave Clearance (AL) Row Multiplier Audit Traces', 
                off: 'Weekly Off Days Cleared Row Multiplier Audit Traces', 
                ph: 'Public Holiday Clearance (PH) Row Multiplier Audit Traces', 
                np: 'No Pay Leave (LWP) Row Multiplier Audit Traces',
                friday: 'Friday Pay Clearance (1.5x Rate Missed) Audit Traces',
                prosecco: 'Unused Prosecco Bottles Cost Saving Configuration Inputs',
                steam: 'Saved Steam Hrs from Laundry Data & Multiplier Calculation Logs'
              };
              
              if (type === 'prosecco') {
                return (
                  <div key={type} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-700 flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
                      <ShoppingBag size={16} className="text-[#6D2158]"/> {labelMap[type]}
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                            <th className="p-2.5 pl-4 uppercase tracking-wider text-[10px]">Timeline</th>
                            <th colSpan={3} className="p-2.5 text-center uppercase tracking-wider text-[10px]">Formula Multiplier Breakdown</th>
                            <th className="p-2.5 text-right bg-purple-50/30 text-[#6D2158] uppercase tracking-wider text-[10px] pr-4">Combined Savings Output</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono text-slate-600">
                          {[0, 1, 2, 3].map(wIdx => {
                            const qty = parseFloat(getManualValue(`ops_prosecco_qty_w${wIdx+1}`)) || 0;
                            const total = qty * proseccoPrice;
                            return (
                              <tr key={wIdx} className="hover:bg-slate-50/50 transition-colors">
                                <td className="p-3 pl-4 font-sans font-bold text-slate-800">Week {wIdx + 1}</td>
                                <td colSpan={3} className="p-3 text-center">
                                  <div className="flex items-center justify-center gap-2 font-sans">
                                    <input 
                                      type="number" 
                                      placeholder="Qty" 
                                      value={getManualValue(`ops_prosecco_qty_w${wIdx+1}`)}
                                      onChange={(e) => handleManualInputChange(`ops_prosecco_qty_w${wIdx+1}`, e.target.value)}
                                      className="w-24 p-1 text-center bg-slate-50 border border-slate-200 focus:border-[#6D2158] focus:bg-white rounded-md outline-none font-bold font-mono text-xs text-[#6D2158]"
                                    />
                                    <span className="text-slate-500 font-bold">btls × ${proseccoPrice.toFixed(2)} = </span>
                                    <span className="font-mono font-black text-[#6D2158]">${total.toFixed(2)}</span>
                                  </div>
                                </td>
                                <td className="p-3 text-right text-[#6D2158] font-black bg-purple-50/20 pr-4">${total.toFixed(2)}</td>
                              </tr>
                            );
                          })}
                          <tr className="bg-slate-50 font-black text-slate-800">
                            <td className="p-3 pl-4 font-sans uppercase tracking-wider text-[10px] text-slate-700">Monthly Summary</td>
                            <td colSpan={3} className="p-3 text-center text-[#6D2158]">
                              Total Bottles Unused: {[0,1,2,3].reduce((sum, w) => sum + (parseFloat(getManualValue(`ops_prosecco_qty_w${w+1}`)) || 0), 0)}
                            </td>
                            <td className="p-3 text-right text-[#6D2158] text-sm pr-4 bg-purple-100/40">
                              ${operationSavings.prosecco.reduce((a,b)=>a+b, 0).toFixed(2)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              }

              if (type === 'steam') {
                return (
                  <div key={type} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-700 flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
                      <RefreshCw size={16} className="text-[#6D2158]"/> {labelMap[type]}
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                            <th className="p-2.5 pl-4 uppercase tracking-wider text-[10px]">Timeline</th>
                            <th colSpan={3} className="p-2.5 text-center uppercase tracking-wider text-[10px]">Formula Multiplier Breakdown</th>
                            <th className="p-2.5 text-right bg-purple-50/30 text-[#6D2158] uppercase tracking-wider text-[10px] pr-4">Combined Savings Output</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono text-slate-600">
                          {[0, 1, 2, 3].map(wIdx => {
                            const hrs = parseFloat(getManualValue(`ops_steam_hrs_w${wIdx+1}`)) || 0;
                            const total = hrs * 20 * steamLiterPrice;
                            return (
                              <tr key={wIdx} className="hover:bg-slate-50/50 transition-colors">
                                <td className="p-3 pl-4 font-sans font-bold text-slate-800">Week {wIdx + 1}</td>
                                <td colSpan={3} className="p-3 text-center">
                                  <div className="flex items-center justify-center gap-2 font-sans">
                                    <input 
                                      type="number" 
                                      placeholder="Hours" 
                                      value={getManualValue(`ops_steam_hrs_w${wIdx+1}`)}
                                      onChange={(e) => handleManualInputChange(`ops_steam_hrs_w${wIdx+1}`, e.target.value)}
                                      className="w-24 p-1 text-center bg-slate-50 border border-slate-200 focus:border-[#6D2158] focus:bg-white rounded-md outline-none font-bold font-mono text-xs text-[#6D2158]"
                                    />
                                    <span className="text-slate-500 font-bold">hrs × 20 Ltrs × ${steamLiterPrice.toFixed(2)} = </span>
                                    <span className="font-mono font-black text-[#6D2158]">${total.toFixed(2)}</span>
                                  </div>
                                </td>
                                <td className="p-3 text-right text-[#6D2158] font-black bg-purple-50/20 pr-4">${total.toFixed(2)}</td>
                              </tr>
                            );
                          })}
                          <tr className="bg-slate-50 font-black text-slate-800">
                            <td className="p-3 pl-4 font-sans uppercase tracking-wider text-[10px] text-slate-700">Monthly Summary</td>
                            <td colSpan={3} className="p-3 text-center text-[#6D2158]">
                              Total Hours Saved: {[0,1,2,3].reduce((sum, w) => sum + (parseFloat(getManualValue(`ops_steam_hrs_w${w+1}`)) || 0), 0)} hrs ({[0,1,2,3].reduce((sum, w) => sum + (parseFloat(getManualValue(`ops_steam_hrs_w${w+1}`)) || 0), 0) * 20} Liters Total)
                            </td>
                            <td className="p-3 text-right text-[#6D2158] text-sm pr-4 bg-purple-100/40">
                              ${operationSavings.steam.reduce((a,b)=>a+b, 0).toFixed(2)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              }

              return (
                <div key={type} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-700 flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
                    <FileSpreadsheet size={16} className="text-[#6D2158]"/> {labelMap[type]}
                  </h3>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                          <th className="p-2.5 pl-4 uppercase tracking-wider text-[10px]">Timeline</th>
                          <th className="p-2.5 text-center uppercase tracking-wider text-[10px]">DA Multiplier Trace</th>
                          <th className="p-2.5 text-center uppercase tracking-wider text-[10px]">DB Multiplier Trace</th>
                          <th className="p-2.5 text-center uppercase tracking-wider text-[10px]">ATM Multiplier Trace</th>
                          <th className="p-2.5 text-right bg-purple-50/30 text-[#6D2158] uppercase tracking-wider text-[10px] pr-4">Combined Savings Output</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-slate-600">
                        {[0, 1, 2, 3].map(wIdx => {
                          const weekKey = `${type}_w${wIdx + 1}`;
                          const data = weeklyWorkings[weekKey] || { DA: 0, DB: 0, ATM: 0 };
                          
                          const daCost = type === 'friday' ? 0 : data.DA * dailyRates.DA;
                          const dbCost = data.DB * dailyRates.DB * (type === 'friday' ? 1.5 : 1);
                          const atmCost = data.ATM * dailyRates.ATM * (type === 'friday' ? 1.5 : 1);
                          const total = daCost + dbCost + atmCost;
                          
                          return (
                            <tr key={wIdx} className="hover:bg-slate-50/50 transition-colors">
                              <td className="p-3 pl-4 font-sans font-bold text-slate-800">Week {wIdx + 1}</td>
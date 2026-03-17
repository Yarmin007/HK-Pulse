"use client";
import React, { useState, useEffect } from 'react';
import { 
  Settings, Key, Sun, Moon, BedDouble, Calendar, ChevronLeft, 
  ChevronRight, Plus, X, Loader2, Search, ShieldAlert, Clock, User, Briefcase
} from "lucide-react";
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

const getToday = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

type GuestRecord = {
    id: string;
    villa_number: string;
    status: string;
    guest_name?: string;
    arrival_time?: string;
    departure_time?: string;
};

const SPECIAL_TYPES = [
    { id: 'HOUSE USE', label: 'House Use', icon: BedDouble, color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
    { id: 'SHOW VILLA', label: 'Show Villa', icon: Key, color: 'bg-purple-100 text-purple-800 border-purple-200' },
    { id: 'TMA DAY', label: 'TMA Day', icon: Sun, color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    { id: 'TMA NIGHT', label: 'TMA Night', icon: Moon, color: 'bg-amber-100 text-amber-900 border-amber-300' },
];

export default function SpecialVillasPage() {
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [masterList, setMasterList] = useState<GuestRecord[]>([]);
  const [isProcessing, setIsProcessing] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // --- Form State ---
  const [newVillaNo, setNewVillaNo] = useState('');
  const [selectedType, setSelectedType] = useState('HOUSE USE');
  
  // Specific Fields
  const [timeInput, setTimeInput] = useState('');
  const [houseUseName, setHouseUseName] = useState('');
  const [houseUsePM, setHouseUsePM] = useState('');
  const [houseUseArr, setHouseUseArr] = useState('');
  const [houseUseDep, setHouseUseDep] = useState('');

  useEffect(() => {
      const sessionData = localStorage.getItem('hk_pulse_session');
      const adminAuth = localStorage.getItem('hk_pulse_admin_auth');
      
      let role = 'staff';
      if (sessionData) {
          try { role = JSON.parse(sessionData).system_role; } catch (e) {}
      }
      if (adminAuth === 'true') role = 'admin';
      
      if (role === 'admin') {
          setIsAdmin(true);
          fetchData();
      } else {
          setIsProcessing(false);
      }
  }, [selectedDate]);

  const fetchData = async () => {
      setIsProcessing(true);
      const { data } = await supabase
          .from('hsk_daily_summary')
          .select('id, villa_number, status, guest_name, arrival_time, departure_time')
          .eq('report_date', selectedDate);
      
      if (data) setMasterList(data);
      setIsProcessing(false);
  };

  const handleAddSpecialVilla = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newVillaNo) return toast.error("Please enter a Villa Number");

      setIsProcessing(true);
      
      // Build the rich data object based on the type selected
      let gName = selectedType;
      let arrTime = null;
      let depTime = null;

      if (selectedType === 'HOUSE USE') {
          const details = [];
          if (houseUsePM) details.push(`PM: ${houseUsePM}`);
          if (houseUseArr) details.push(`Arr: ${new Date(houseUseArr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`);
          if (houseUseDep) details.push(`Dep: ${new Date(houseUseDep).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`);
          
          gName = houseUseName ? houseUseName : 'House Use Staff';
          if (details.length > 0) {
              gName += ` (${details.join(' | ')})`;
          }
      } else {
          if (timeInput) {
              arrTime = timeInput;
              depTime = timeInput;
              gName = `${selectedType} @ ${timeInput}`;
          }
      }

      const existing = masterList.find(v => String(v.villa_number) === String(newVillaNo));
      let resultError = null;

      if (existing) {
          const { error } = await supabase
              .from('hsk_daily_summary')
              .update({ 
                  status: selectedType,
                  guest_name: gName,
                  arrival_time: arrTime,
                  departure_time: depTime
              })
              .eq('id', existing.id);
          resultError = error;
      } else {
          const { error } = await supabase
              .from('hsk_daily_summary')
              .insert({ 
                  report_date: selectedDate, 
                  villa_number: newVillaNo, 
                  status: selectedType,
                  guest_name: gName,
                  arrival_time: arrTime,
                  departure_time: depTime
              });
          resultError = error;
      }

      if (resultError) {
          toast.error("Failed to update Guest List");
      } else {
          toast.success(`Villa ${newVillaNo} set to ${selectedType}`);
          setNewVillaNo('');
          setTimeInput('');
          setHouseUseName('');
          setHouseUsePM('');
          setHouseUseArr('');
          setHouseUseDep('');
          fetchData(); 
      }
  };

  const handleRevertToVacant = async (id: string, villaNo: string) => {
      if (!confirm(`Revert Villa ${villaNo} back to standard VAC?`)) return;
      
      setIsProcessing(true);
      const { error } = await supabase
          .from('hsk_daily_summary')
          .update({ status: 'VAC', guest_name: null, arrival_time: null, departure_time: null })
          .eq('id', id);
          
      if (error) toast.error("Failed to revert status");
      else toast.success(`Villa ${villaNo} is now VAC`);
      
      fetchData();
  };

  const changeDate = (days: number) => {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() + days);
      setSelectedDate(d.toISOString().split('T')[0]);
  };

  if (!isProcessing && !isAdmin) {
      return (
          <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
              <ShieldAlert size={64} className="text-rose-500 mb-4 opacity-50" />
              <h1 className="text-2xl font-black text-slate-800 mb-2">Access Denied</h1>
              <p className="text-slate-500">This module is strictly restricted to the Admin team.</p>
          </div>
      );
  }

  const specialVillas = masterList.filter(v => SPECIAL_TYPES.map(t => t.id).includes((v.status || '').toUpperCase()));

  return (
    <div className="min-h-screen bg-slate-100 p-2 md:p-4 pb-32">
        {/* HEADER */}
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
            <div className="flex items-center gap-3">
                <div className="h-8 w-1 bg-[#6D2158] rounded-full shrink-0"></div>
                <div>
                    <h1 className="text-lg font-black text-slate-800">Special Villas & TMA</h1>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                       Override Guest List Status
                    </p>
                </div>
            </div>
            
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
                <button onClick={() => changeDate(-1)} className="p-1.5 hover:bg-white rounded-md text-slate-500"><ChevronLeft size={16}/></button>
                <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="bg-transparent text-xs font-bold text-slate-700 outline-none px-1 cursor-pointer"/>
                <button onClick={() => changeDate(1)} className="p-1.5 hover:bg-white rounded-md text-slate-500"><ChevronRight size={16}/></button>
            </div>
        </div>

        {isProcessing ? (
            <div className="py-20 flex justify-center"><Loader2 size={32} className="text-[#6D2158] animate-spin" /></div>
        ) : (
            <div className="flex flex-col lg:flex-row gap-6 items-start">
                
                {/* ADD NEW SPECIAL VILLA FORM */}
                <div className="w-full lg:w-80 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden shrink-0">
                    <div className="bg-slate-50 border-b border-slate-200 p-4">
                        <h2 className="text-sm font-black text-slate-800 flex items-center gap-2"><Settings size={16} className="text-[#6D2158]"/> Status Override</h2>
                        <p className="text-[10px] font-bold text-slate-500 mt-1">Updates sync instantly to the Master Guest List.</p>
                    </div>
                    
                    <form onSubmit={handleAddSpecialVilla} className="p-4 flex flex-col gap-4">
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Villa Number</label>
                            <input 
                                type="number" 
                                required
                                value={newVillaNo}
                                onChange={(e) => setNewVillaNo(e.target.value)}
                                placeholder="e.g. 42" 
                                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm font-bold outline-none focus:border-[#6D2158] transition-colors"
                            />
                        </div>
                        
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Special Status</label>
                            <div className="grid grid-cols-1 gap-2">
                                {SPECIAL_TYPES.map(type => (
                                    <label key={type.id} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${selectedType === type.id ? `ring-2 ring-[#6D2158] ${type.color}` : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                                        <input 
                                            type="radio" 
                                            name="special_type" 
                                            value={type.id} 
                                            checked={selectedType === type.id} 
                                            onChange={(e) => {
                                                setSelectedType(e.target.value);
                                                setTimeInput(''); // Reset specific fields on change
                                                setHouseUseName('');
                                            }}
                                            className="hidden"
                                        />
                                        <type.icon size={16} className={selectedType === type.id ? 'opacity-100' : 'text-slate-400'}/>
                                        <span className="text-xs font-bold flex-1">{type.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* CONDITIONAL EXTRA FIELDS */}
                        {selectedType === 'HOUSE USE' ? (
                            <div className="bg-indigo-50/50 border border-indigo-100 p-3 rounded-xl flex flex-col gap-3 mt-2 animate-in fade-in zoom-in-95 duration-200">
                                <div>
                                    <label className="text-[9px] font-black text-indigo-800 uppercase flex items-center gap-1 mb-1"><User size={10}/> Guest / Staff Name</label>
                                    <input type="text" value={houseUseName} onChange={e=>setHouseUseName(e.target.value)} className="w-full bg-white border border-indigo-200 rounded p-2 text-xs font-bold outline-none focus:border-indigo-400" placeholder="Name of person staying" />
                                </div>
                                <div>
                                    <label className="text-[9px] font-black text-indigo-800 uppercase flex items-center gap-1 mb-1"><Briefcase size={10}/> PM Account (Optional)</label>
                                    <input type="text" value={houseUsePM} onChange={e=>setHouseUsePM(e.target.value)} className="w-full bg-white border border-indigo-200 rounded p-2 text-xs font-bold outline-none focus:border-indigo-400" placeholder="e.g. PM-1029" />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[9px] font-black text-indigo-800 uppercase mb-1 block">Arrival Date</label>
                                        <input type="date" value={houseUseArr} onChange={e=>setHouseUseArr(e.target.value)} className="w-full bg-white border border-indigo-200 rounded p-2 text-xs font-bold outline-none focus:border-indigo-400 text-slate-700" />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-black text-indigo-800 uppercase mb-1 block">Dep Date</label>
                                        <input type="date" value={houseUseDep} onChange={e=>setHouseUseDep(e.target.value)} className="w-full bg-white border border-indigo-200 rounded p-2 text-xs font-bold outline-none focus:border-indigo-400 text-slate-700" />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl mt-2 animate-in fade-in zoom-in-95 duration-200">
                                <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-1 mb-1"><Clock size={12}/> Specific Time</label>
                                <input 
                                    type="time" 
                                    value={timeInput} 
                                    onChange={e=>setTimeInput(e.target.value)} 
                                    className="w-full bg-white border border-slate-300 rounded p-2 text-sm font-bold outline-none focus:border-[#6D2158] text-slate-800" 
                                />
                            </div>
                        )}

                        <button type="submit" className="w-full bg-[#6D2158] hover:bg-[#5a1b49] text-white font-bold text-sm py-3 rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 mt-4">
                            <Plus size={16} strokeWidth={3}/> Update Guest List
                        </button>
                    </form>
                </div>

                {/* CURRENT SPECIAL VILLAS GRID */}
                <div className="flex-1 grid grid-cols-1 xl:grid-cols-2 gap-4 w-full">
                    {SPECIAL_TYPES.map(type => {
                        const typeVillas = specialVillas.filter(v => (v.status || '').toUpperCase() === type.id);
                        
                        return (
                            <div key={type.id} className={`rounded-2xl border bg-white shadow-sm overflow-hidden flex flex-col`}>
                                <div className={`p-3 border-b flex items-center justify-between ${type.color}`}>
                                    <div className="flex items-center gap-2">
                                        <type.icon size={16}/>
                                        <h3 className="text-xs font-black uppercase tracking-widest">{type.label}</h3>
                                    </div>
                                    <span className="bg-white/50 px-2 py-0.5 rounded text-[10px] font-black">{typeVillas.length}</span>
                                </div>
                                
                                <div className="p-3 flex-1 bg-slate-50/50">
                                    {typeVillas.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center py-6 opacity-40">
                                            <type.icon size={32} className="mb-2"/>
                                            <p className="text-xs font-bold italic">No villas marked</p>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-2">
                                            {typeVillas.map(v => (
                                                <div key={v.id} className="bg-white border border-slate-300 rounded shadow-sm flex items-stretch overflow-hidden w-full group">
                                                    <div className={`px-4 py-2 font-black text-sm text-slate-800 flex items-center justify-center border-r border-slate-200 ${type.color.replace('text-', 'bg-').replace('100', '50')}`}>
                                                        V{v.villa_number}
                                                    </div>
                                                    <div className="flex-1 p-2 flex flex-col justify-center min-w-0">
                                                        <div className="text-xs font-bold text-slate-800 truncate">
                                                            {v.guest_name || type.label}
                                                        </div>
                                                        {(v.arrival_time || v.departure_time) && (
                                                            <div className="text-[9px] font-black text-slate-400 mt-0.5 uppercase tracking-wider">
                                                                Time logged: {v.arrival_time || v.departure_time}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <button 
                                                        onClick={() => handleRevertToVacant(v.id, v.villa_number)}
                                                        className="px-3 bg-slate-50 border-l border-slate-200 text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors flex items-center justify-center"
                                                        title="Revert to VAC"
                                                    >
                                                        <X size={16} strokeWidth={2.5}/>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>

            </div>
        )}
    </div>
  );
}
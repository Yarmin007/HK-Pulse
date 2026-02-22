"use client";
import React, { useState, useEffect } from 'react';
import { 
  Lock, ArrowRight, User, MapPin, Search, 
  Plus, Minus, Save, CheckCircle2, Loader2, ChevronLeft, Wine, AlertCircle
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// --- CUSTOM SORTING LOGIC ---
const getCategoryWeight = (cat: string) => {
  const c = (cat || '').toLowerCase();
  if (c.includes('bite') || c.includes('sweet') || c.includes('food') || c.includes('snack')) return 1;
  if (c.includes('soft') || c.includes('juice') || c.includes('water') || c.includes('beverage')) return 2;
  if (c.includes('beer')) return 3;
  if (c.includes('wine')) return 4;
  if (c.includes('spirit') || c.includes('liquor') || c.includes('hard') || c.includes('alcohol')) return 5;
  return 6;
};

// --- TYPES ---
type Host = {
  id: string;
  full_name: string;
  host_id: string;
};

type MasterItem = {
  article_number: string;
  article_name: string;
  generic_name?: string;
  category: string;
  image_url?: string;
};

// Helper: Convert "1, 2, 5-8" into ["1", "2", "5", "6", "7", "8"]
const parseVillas = (input: string) => {
    const result = new Set<string>();
    const parts = input.split(',').map(s => s.trim());
    for (const p of parts) {
        if (p.includes('-')) {
            const [start, end] = p.split('-').map(Number);
            if (!isNaN(start) && !isNaN(end) && start <= end) {
                for (let i = start; i <= end; i++) result.add(String(i));
            }
        } else if (p) {
            if (!isNaN(Number(p))) result.add(String(Number(p)));
        }
    }
    return Array.from(result).sort((a,b) => Number(a) - Number(b));
};

export default function MinibarInventoryApp() {
  const [isMounted, setIsMounted] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isLoading, setIsLoading] = useState(false);
  
  // Auth State
  const [sslInput, setSslInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [currentHost, setCurrentHost] = useState<Host | null>(null);

  // Villa State
  const [assignedVillas, setAssignedVillas] = useState<string[]>([]);
  const [completedVillas, setCompletedVillas] = useState<string[]>([]);
  const [selectedVilla, setSelectedVilla] = useState('');

  // Catalog & Counting State
  const [catalog, setCatalog] = useState<MasterItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [activeCategory, setActiveCategory] = useState('All');

  // Success State
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    fetchCatalog();
  }, []);

  const fetchCatalog = async () => {
    // Fetch items and the hidden list simultaneously
    const [catRes, hiddenRes] = await Promise.all([
        supabase.from('hsk_master_catalog').select('*').eq('is_minibar_item', true),
        supabase.from('hsk_constants').select('label').eq('type', 'hidden_mb_item')
    ]);
    
    if (catRes.data) {
        const hiddenList = hiddenRes.data ? hiddenRes.data.map(h => h.label) : [];
        const filteredAndSorted = catRes.data
            .filter(i => !hiddenList.includes(i.article_number))
            .sort((a, b) => getCategoryWeight(a.category) - getCategoryWeight(b.category) || a.article_name.localeCompare(b.article_name));
        
        setCatalog(filteredAndSorted);
    }
  };

  // --- STEP 1: STRICT SSL LOGIN ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = sslInput.trim();
    if (!val) return;
    
    setIsLoading(true);
    setAuthError('');

    // Extract ONLY digits from input (e.g. if they accidentally type "SSL123", we just want "123")
    const inputDigits = val.replace(/\D/g, '');

    if (!inputDigits) {
        setAuthError('Please enter a valid numeric Host ID.');
        setIsLoading(false);
        return;
    }

    const { data: hosts, error: hostErr } = await supabase.from('hsk_hosts').select('*');

    if (hostErr || !hosts) {
      setAuthError('Database connection error. Try again.');
      setIsLoading(false);
      return;
    }

    // STRICT MATCH: ONLY look at host_id
    const foundHost = hosts.find(h => {
        const dbIdDigits = (h.host_id || '').replace(/\D/g, '');
        return dbIdDigits === inputDigits;
    });

    if (!foundHost) {
      setAuthError('Host Number not recognized. Access denied.');
      setIsLoading(false);
      return;
    }

    // 2. Fetch Allocations for Today
    const today = new Date().toISOString().split('T')[0];
    const { data: allocations, error: allocErr } = await supabase
        .from('hsk_minibar_allocations')
        .select('villas')
        .eq('date', today)
        .eq('host_id', foundHost.host_id)
        .maybeSingle();

    if (!allocations || !allocations.villas) {
        setAuthError(`Welcome ${foundHost.full_name.split(' ')[0]}, but you have NO VILLAS assigned today. Check the Admin Dashboard.`);
        setIsLoading(false);
        return;
    }

    const parsed = parseVillas(allocations.villas);
    setAssignedVillas(parsed);

    // 3. Check which ones are already completed today
    const startOfDay = `${today}T00:00:00`;
    const { data: submissions } = await supabase
        .from('hsk_villa_minibar_inventory')
        .select('villa_number')
        .gte('logged_at', startOfDay)
        .eq('host_id', foundHost.host_id);

    if (submissions) {
        const done = submissions.map(s => s.villa_number);
        setCompletedVillas(done);
    }

    setCurrentHost(foundHost);
    setStep(2);
    setIsLoading(false);
  };

  // --- STEP 2: START INVENTORY ---
  const startAudit = (villa: string) => {
    setSelectedVilla(villa);
    const initialCounts: Record<string, number> = {};
    catalog.forEach(item => { initialCounts[item.article_number] = 0; });
    setCounts(initialCounts);
    setStep(3);
  };

  // --- STEP 3: COUNTING ---
  const updateCount = (article_number: string, delta: number) => {
    setCounts(prev => {
      const current = prev[article_number] || 0;
      const next = current + delta;
      return { ...prev, [article_number]: next < 0 ? 0 : next };
    });
  };

  const handleSaveInventory = async () => {
    if (!confirm(`Submit inventory for Villa ${selectedVilla}?`)) return;
    setIsLoading(true);

    const countedItems = Object.entries(counts)
        .filter(([_, qty]) => qty > 0)
        .map(([artNo, qty]) => {
            const item = catalog.find(c => c.article_number === artNo);
            return {
                article_number: artNo,
                name: item?.generic_name || item?.article_name,
                qty
            };
        });

    const payload = {
        villa_number: selectedVilla,
        host_id: currentHost?.host_id,
        host_name: currentHost?.full_name,
        inventory_data: countedItems,
        logged_at: new Date().toISOString()
    };

    const { error } = await supabase.from('hsk_villa_minibar_inventory').insert(payload);

    setIsLoading(false);

    if (error) {
        console.error("Save Error", error);
    } else {
        setCompletedVillas(prev => [...prev, selectedVilla]);
    }

    setShowSuccess(true);
  };

  const resetFlow = () => {
    setShowSuccess(false);
    setSelectedVilla('');
    setStep(2);
  };

  const categories = ['All', ...Array.from(new Set(catalog.map(i => i.category)))];

  if (!isMounted) return null;

  return (
    // Fixed: min-h-[100dvh] ensures it perfectly fits mobile screens including Safari bottom bar
    <div className="min-h-[100dvh] bg-slate-50 md:bg-slate-100 flex items-center justify-center p-0 md:p-6 font-antiqua">
      
      {/* Mobile-sized container */}
      <div className="w-full max-w-md h-[100dvh] md:h-[85vh] bg-white md:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col relative">
        
        {/* --- STEP 1: AUTHENTICATION --- */}
        {step === 1 && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gradient-to-b from-[#6D2158] to-[#902468] text-white">
                <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mb-6 shadow-inner border border-white/20">
                    <Wine size={32} className="text-white"/>
                </div>
                <h1 className="text-3xl font-black tracking-tight mb-2">Minibar Inventory</h1>
                <p className="text-white/70 text-sm mb-12 uppercase tracking-widest font-bold">Attendant Portal</p>

                <form onSubmit={handleLogin} className="w-full space-y-4">
                    <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest text-white/70 ml-2">Host Number</label>
                        <div className="relative mt-1 flex items-center bg-white/10 border border-white/20 rounded-2xl overflow-hidden focus-within:bg-white/20 transition-all">
                            <div className="pl-4 pr-2 py-4 text-white/60 font-black flex items-center gap-2">
                                <Lock size={16} />
                                <span>SSL</span>
                            </div>
                            <input 
                                type="number" 
                                autoFocus
                                className="w-full pr-4 py-4 bg-transparent text-white font-bold text-2xl outline-none placeholder:text-white/30"
                                placeholder="10245"
                                value={sslInput}
                                onChange={e => setSslInput(e.target.value)}
                            />
                        </div>
                    </div>
                    
                    {authError && <div className="bg-rose-500/20 border border-rose-500/50 p-3 rounded-xl flex flex-col gap-1 text-rose-200 text-xs font-bold animate-in fade-in"><div className="flex items-center gap-2"><AlertCircle size={16} className="shrink-0"/> {authError}</div></div>}

                    <button disabled={isLoading || !sslInput} className="w-full py-4 bg-white text-[#6D2158] rounded-2xl font-black uppercase tracking-widest shadow-xl hover:bg-slate-50 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center gap-2 mt-4">
                        {isLoading ? <Loader2 className="animate-spin" size={20}/> : 'Login securely'} <ArrowRight size={18}/>
                    </button>
                </form>
            </div>
        )}

        {/* --- STEP 2: VILLA SELECTION (GRID) --- */}
        {step === 2 && currentHost && (
            // Fixed: min-h-0 allows the inner scroll container to work correctly
            <div className="flex-1 flex flex-col bg-slate-50 min-h-0 relative">
                <div className="bg-[#6D2158] p-6 text-white pb-10 rounded-b-[2.5rem] shadow-md shrink-0">
                    <p className="text-xs font-bold text-white/60 uppercase tracking-widest mb-1">Welcome back,</p>
                    <h2 className="text-2xl font-black flex items-center gap-2 truncate"><User size={24}/> {currentHost.full_name.split(' ')[0]}</h2>
                </div>

                <div className="flex-1 p-6 -mt-6 overflow-y-auto pb-10">
                    <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-100 mb-6 animate-in slide-in-from-bottom-4">
                        <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4">
                            <MapPin size={24} />
                        </div>
                        <h3 className="text-lg font-bold text-slate-800 mb-1">Your Assigned Villas</h3>
                        <p className="text-xs text-slate-400 mb-6 font-medium">Tap a villa number below to begin inventory.</p>

                        <div className="grid grid-cols-3 gap-3">
                            {assignedVillas.map(villa => {
                                const isDone = completedVillas.includes(villa);
                                return (
                                    <button 
                                        key={villa}
                                        onClick={() => startAudit(villa)}
                                        className={`aspect-square rounded-2xl flex flex-col items-center justify-center relative shadow-sm border-2 transition-transform active:scale-95 ${isDone ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-[#6D2158]'}`}
                                    >
                                        {isDone && <CheckCircle2 size={14} className="absolute top-2 right-2 text-emerald-500"/>}
                                        <span className="text-2xl font-black">{villa}</span>
                                        <span className="text-[9px] font-bold uppercase mt-1 opacity-60">{isDone ? 'Done' : 'Pending'}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* --- STEP 3: INVENTORY ENTRY --- */}
        {step === 3 && currentHost && (
            // Fixed: min-h-0 is absolutely necessary here to allow inner overflow scrolling!
            <div className="flex-1 flex flex-col bg-white min-h-0 relative">
                
                {/* Header */}
                <div className="bg-[#6D2158] text-white pt-6 pb-4 px-4 flex flex-col shrink-0 shadow-md z-10">
                    <div className="flex items-center justify-between mb-2">
                        <button onClick={() => setStep(2)} className="p-2 bg-white/10 rounded-full"><ChevronLeft size={20}/></button>
                        <div className="text-center">
                            <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Inventorying</p>
                            <h2 className="text-xl font-black">Villa {selectedVilla}</h2>
                        </div>
                        <div className="w-9"></div> {/* Spacer */}
                    </div>
                    
                    {/* Category Filter Horizontal Scroll */}
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 px-2">
                        {categories.map(cat => (
                            <button 
                                key={cat} 
                                onClick={() => setActiveCategory(cat)}
                                className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors border ${activeCategory === cat ? 'bg-white text-[#6D2158] border-white' : 'bg-transparent text-white border-white/30'}`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Items List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50 pb-[100px]">
                    {catalog.filter(i => activeCategory === 'All' || i.category === activeCategory).map(item => (
                        <div key={item.article_number} className="bg-white p-3 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between gap-4 animate-in slide-in-from-bottom-2">
                            
                            <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center shrink-0 border border-slate-100 overflow-hidden">
                                {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover"/> : <Wine size={20} className="text-slate-300"/>}
                            </div>
                            
                            <div className="flex-1 pr-2">
                                <h4 className="text-sm font-bold text-slate-800 leading-tight">{item.generic_name || item.article_name}</h4>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{item.category}</p>
                            </div>

                            {/* Counter Controls */}
                            <div className="flex items-center bg-slate-50 rounded-xl border border-slate-200 p-1 shrink-0">
                                <button 
                                    onClick={() => updateCount(item.article_number, -1)} 
                                    className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-sm text-slate-500 hover:text-rose-500 active:scale-95 transition-all"
                                >
                                    <Minus size={16}/>
                                </button>
                                <span className="w-8 text-center font-black text-[#6D2158] text-lg">
                                    {counts[item.article_number] || 0}
                                </span>
                                <button 
                                    onClick={() => updateCount(item.article_number, 1)} 
                                    className="w-8 h-8 flex items-center justify-center bg-[#6D2158] rounded-lg shadow-sm text-white active:scale-95 transition-all"
                                >
                                    <Plus size={16}/>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Sticky Bottom Bar */}
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-100 shadow-[0_-10px_20px_rgba(0,0,0,0.03)] z-20">
                    <button onClick={handleSaveInventory} disabled={isLoading} className="w-full py-4 bg-[#6D2158] text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-purple-900/20 active:scale-95 transition-all flex items-center justify-center gap-2">
                        {isLoading ? <Loader2 className="animate-spin" size={20}/> : <><Save size={18}/> Submit Record</>}
                    </button>
                </div>
            </div>
        )}

        {/* --- SUCCESS OVERLAY --- */}
        {showSuccess && (
            <div className="absolute inset-0 z-50 bg-emerald-600 flex flex-col items-center justify-center text-white p-8 animate-in fade-in zoom-in-95 duration-300">
                <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mb-6">
                    <CheckCircle2 size={64} className="text-white"/>
                </div>
                <h2 className="text-3xl font-black text-center mb-2">Saved!</h2>
                <p className="text-center font-medium text-emerald-100 mb-10">Villa {selectedVilla} inventory has been successfully logged to the system.</p>
                
                <button onClick={resetFlow} className="w-full py-4 bg-white text-emerald-700 rounded-2xl font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all">
                    Log Next Villa
                </button>
            </div>
        )}

      </div>
    </div>
  );
}